import type { Product, ProductId, TenantId } from '@corebiz/domain';
import type { IdGenerator, Page, ProductRepository } from '@corebiz/application';
import { Prisma } from '@corebiz/prisma-client';
import { fromProduct, toProduct, type StockMovementInsert } from './mappers';
import { escapeLikeWildcards, pageLimit } from './pagination';
import { isRowKey, onlyRowKeys } from './record-id';
import type { Tx } from './session';

export class PrismaProductRepository implements ProductRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * Locks these products' rows until the end of the transaction.
   *
   * THIS IS WHAT PREVENTS SELLING THE SAME UNIT TWICE, and it had to be added because it
   * was missing: two simultaneous notes of four units against a stock of five were BOTH
   * issued, and the stock ledger ended with two -4 movements, both with a resulting balance
   * of 1. Eight units left the warehouse and the system said four.
   *
   * The reason is that the balance is not incremented in the database: it is computed in
   * the aggregate and written as an absolute value (`on_hand = excluded.on_hand`, below).
   * Under the default isolation — READ COMMITTED — both transactions read five, both
   * compute one, and the second overwrites the first. The table's `on_hand >= 0` does not
   * catch it, because one is greater than zero.
   *
   * A `select ... for update` before reading closes it: the second transaction waits, and
   * once in it re-reads the committed row — one, not five — so the domain rejects it with
   * insufficient stock, which is correct.
   *
   * `order by id` is not decorative: always locking in the same order is what stops two
   * notes with the same products in a different order from waiting on each other.
   *
   * It lives in this repository and not in the read models on purpose: this is only
   * entered to WRITE, inside `withTenant`. A list that just renders a table must not lock
   * anything.
   */
  private async lockForUpdate(ids: readonly ProductId[]): Promise<void> {
    if (ids.length === 0) return;

    await this.tx.$queryRaw`
      select 1
        from public.products
       where tenant_id = ${this.tenantId}::uuid
         and id in (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
       order by id
         for update
    `;
  }

  async findById(id: ProductId): Promise<Product | null> {
    if (!isRowKey(id)) return null;

    await this.lockForUpdate([id]);

    const row = await this.tx.products.findFirst({
      where: { tenant_id: this.tenantId, id },
    });
    return row === null ? null : toProduct(row);
  }

  async findBySku(sku: string): Promise<Product | null> {
    const normalized = sku.trim().toUpperCase();

    const row = await this.tx.products.findFirst({
      where: { tenant_id: this.tenantId, sku: normalized },
    });
    return row === null ? null : toProduct(row);
  }

  /**
   * Carga varios productos de una vez.
   *
   * Existe para que emitir una nota con quince lineas sea UNA consulta y no quince. Dentro
   * de una transaccion cada viaje extra a la base de datos alarga el bloqueo sobre las
   * filas ya tocadas, asi que el N+1 aqui no es solo lento: reduce la concurrencia de todo
   * el sistema.
   */
  async findManyByIds(ids: readonly ProductId[]): Promise<Product[]> {
    // Ids that cannot be keys are dropped before touching the database: see
    // `record-id.ts`. The use case already notices "asked for five, got four", so an
    // impossible id ends as a missing-product error instead of a 500.
    const keys = onlyRowKeys(ids);
    if (keys.length === 0) return [];

    // All at once and in order, before reading: see `lockForUpdate`.
    await this.lockForUpdate(keys);

    const rows = await this.tx.products.findMany({
      where: { tenant_id: this.tenantId, id: { in: keys } },
    });

    return rows.map(toProduct);
  }

  async list(filter: {
    search?: string;
    belowMinimum?: boolean;
    limit?: number;
  }): Promise<Page<Product>> {
    const limit = pageLimit(filter.limit);
    const search = filter.search?.trim() ?? '';

    const rows = await this.tx.products.findMany({
      where: {
        tenant_id: this.tenantId,
        archived_at: null,
        ...(search !== ''
          ? {
              OR: [
                { name: { contains: escapeLikeWildcards(search), mode: 'insensitive' } },
                { sku: { contains: escapeLikeWildcards(search), mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(filter.belowMinimum === true
          ? {
              // Traduccion del getter `isBelowMinimum` del dominio. Un producto sin
              // seguimiento de stock nunca esta bajo minimo: no es que le falte
              // existencia, es que el concepto no le aplica.
              //
              // `this.tx.products.fields.min_stock` es una referencia a COLUMNA, no un
              // valor: compara `on_hand < min_stock` fila a fila, que es justo lo que en
              // SQL era una condicion entre dos columnas. Sin esto habria que bajar a SQL
              // crudo o traerse la tabla y filtrar fuera, y esto ultimo romperia el
              // limite.
              track_stock: true,
              min_stock: { not: null },
              on_hand: { lt: this.tx.products.fields.min_stock },
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    // El filtro de este puerto no admite cursor, asi que no hay pagina siguiente que
    // ofrecer. El listado con paginacion vive en el lado de lectura.
    return { items: rows.map(toProduct), nextCursor: null };
  }

  save(product: Product): Promise<void> {
    return this.saveMany([product]);
  }

  /**
   * Guarda los productos Y sus movimientos de inventario pendientes.
   *
   * ESTE ES EL PUNTO MAS DELICADO DEL ADAPTADOR. El agregado acumula los movimientos que
   * ha generado y `pullStockMovements()` los entrega vaciando la lista. Si el repositorio
   * no los escribe, el saldo cambia pero el libro mayor no lo explica: el inventario deja
   * de poder auditarse y nadie se entera hasta que alguien cuenta fisicamente.
   *
   * El doble en memoria los consume y los descarta, asi que ningun test unitario cubre
   * esto. Lo cubre un test de integracion, a proposito.
   *
   * Saldo y movimientos se escriben en la MISMA transaccion. Separarlos abriria una
   * ventana en la que el stock ya bajo pero el motivo todavia no existe.
   */
  async saveMany(items: readonly Product[]): Promise<void> {
    if (items.length === 0) return;

    const movements: StockMovementInsert[] = [];
    const rows = items.map((product) => {
      for (const movement of product.pullStockMovements()) {
        movements.push({
          id: this.ids.next(),
          tenant_id: this.tenantId,
          product_id: product.id,
          kind: movement.kind,
          quantity: movement.quantity.scaledValue,
          balance_after: movement.balanceAfter.scaledValue,
          ref_type: movement.refType,
          ref_id: movement.refId,
          note: movement.note,
          occurred_at: movement.occurredAt,
        });
      }
      return fromProduct(product);
    });

    /*
     * UN SOLO INSERT para todos los productos, y va en SQL crudo por obligacion.
     *
     * `excluded` es la fila que se intentaba insertar, y es la unica forma de que un
     * upsert de VARIAS filas actualice cada una con SUS valores. Prisma no tiene
     * `upsertMany`: la alternativa seria un `upsert()` por producto, y emitir una nota de
     * quince lineas pasaria de una sentencia a quince, cada una con su ida y vuelta
     * mientras la transaccion mantiene bloqueadas las filas ya tocadas.
     *
     * Los valores viajan parametrizados —`Prisma.join` compone los grupos, no los
     * concatena como texto— asi que esto no reabre la puerta a inyeccion.
     */
    const valores = Prisma.join(
      rows.map(
        (r) => Prisma.sql`(
          ${r.id}::uuid, ${r.tenant_id}::uuid, ${r.sku}, ${r.name}, ${r.description},
          ${r.unit}, ${r.price_minor}::bigint, ${r.price_currency},
          ${r.cost_minor}::bigint, ${r.cost_currency}, ${r.taxable}, ${r.track_stock},
          ${r.on_hand}::bigint, ${r.min_stock}::bigint, ${r.stock_policy},
          ${r.archived_at}::timestamptz
        )`,
      ),
      ', ',
    );

    await this.tx.$executeRaw`
      insert into public.products (
        id, tenant_id, sku, name, description, unit, price_minor, price_currency,
        cost_minor, cost_currency, taxable, track_stock, on_hand, min_stock,
        stock_policy, archived_at
      )
      values ${valores}
      on conflict (id) do update set
        sku            = excluded.sku,
        name           = excluded.name,
        description    = excluded.description,
        unit           = excluded.unit,
        price_minor    = excluded.price_minor,
        price_currency = excluded.price_currency,
        cost_minor     = excluded.cost_minor,
        cost_currency  = excluded.cost_currency,
        taxable        = excluded.taxable,
        track_stock    = excluded.track_stock,
        on_hand        = excluded.on_hand,
        min_stock      = excluded.min_stock,
        stock_policy   = excluded.stock_policy,
        archived_at    = excluded.archived_at
    `;

    if (movements.length > 0) {
      await this.tx.stock_movements.createMany({ data: movements });
    }
  }
}
