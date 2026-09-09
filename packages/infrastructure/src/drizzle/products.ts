import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { schema } from '@corebiz/db';
import type { Product, ProductId, TenantId } from '@corebiz/domain';
import type { IdGenerator, Page, ProductRepository } from '@corebiz/application';
import { fromProduct, toProduct, type StockMovementInsert } from './mappers';
import { likePattern, pageLimit } from '../prisma/pagination';
import type { Tx } from './tx';

const { products, stockMovements } = schema;

export class DrizzleProductRepository implements ProductRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: ProductId): Promise<Product | null> {
    const rows = await this.tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, this.tenantId), eq(products.id, id)))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toProduct(row);
  }

  async findBySku(sku: string): Promise<Product | null> {
    const normalized = sku.trim().toUpperCase();

    const rows = await this.tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, this.tenantId), eq(products.sku, normalized)))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toProduct(row);
  }

  /**
   * Carga varios productos de una vez.
   *
   * Existe para que emitir una nota con quince lineas sea UNA consulta y no
   * quince. Dentro de una transaccion cada viaje extra a la base de datos alarga
   * el bloqueo sobre las filas ya tocadas, asi que el N+1 aqui no es solo lento:
   * reduce la concurrencia de todo el sistema.
   */
  async findManyByIds(ids: readonly ProductId[]): Promise<Product[]> {
    if (ids.length === 0) return [];

    const rows = await this.tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, this.tenantId), inArray(products.id, [...ids])));

    return rows.map(toProduct);
  }

  async list(filter: {
    search?: string;
    belowMinimum?: boolean;
    limit?: number;
  }): Promise<Page<Product>> {
    const limit = pageLimit(filter.limit);
    const conditions = [eq(products.tenantId, this.tenantId), isNull(products.archivedAt)];

    if (filter.search !== undefined && filter.search.trim() !== '') {
      const pattern = likePattern(filter.search);
      const match = or(ilike(products.name, pattern), ilike(products.sku, pattern));
      if (match !== undefined) conditions.push(match);
    }

    if (filter.belowMinimum === true) {
      // Traduccion del getter `isBelowMinimum` del dominio. Un producto sin
      // seguimiento de stock nunca esta bajo minimo: no es que le falte
      // existencia, es que el concepto no le aplica.
      conditions.push(
        sql`${products.trackStock} and ${products.minStock} is not null and ${products.onHand} < ${products.minStock}`,
      );
    }

    const rows = await this.tx
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.name), asc(products.id))
      .limit(limit);

    // El filtro de este puerto no admite cursor, asi que no hay pagina siguiente
    // que ofrecer. El listado con paginacion vive en el lado de lectura.
    return { items: rows.map(toProduct), nextCursor: null };
  }

  save(product: Product): Promise<void> {
    return this.saveMany([product]);
  }

  /**
   * Guarda los productos Y sus movimientos de inventario pendientes.
   *
   * ESTE ES EL PUNTO MAS DELICADO DEL ADAPTADOR. El agregado acumula los
   * movimientos que ha generado y `pullStockMovements()` los entrega vaciando la
   * lista. Si el repositorio no los escribe, el saldo cambia pero el libro mayor
   * no lo explica: el inventario deja de poder auditarse y nadie se entera hasta
   * que alguien cuenta fisicamente.
   *
   * El doble en memoria los consume y los descarta, asi que ningun test unitario
   * cubre esto. Lo cubre un test de integracion, a proposito.
   *
   * Saldo y movimientos se escriben en la MISMA transaccion. Separarlos abriria
   * una ventana en la que el stock ya bajo pero el motivo todavia no existe.
   */
  async saveMany(items: readonly Product[]): Promise<void> {
    if (items.length === 0) return;

    const movements: StockMovementInsert[] = [];
    const rows = items.map((product) => {
      for (const movement of product.pullStockMovements()) {
        movements.push({
          id: this.ids.next(),
          tenantId: this.tenantId,
          productId: product.id,
          kind: movement.kind,
          quantity: movement.quantity.scaledValue,
          balanceAfter: movement.balanceAfter.scaledValue,
          refType: movement.refType,
          refId: movement.refId,
          note: movement.note,
          occurredAt: movement.occurredAt,
        });
      }
      return fromProduct(product);
    });

    // Un solo INSERT para todos los productos. `excluded` es la fila que se
    // intentaba insertar, y es la unica forma de que un upsert de varias filas
    // actualice cada una con SUS valores.
    await this.tx
      .insert(products)
      .values(rows)
      .onConflictDoUpdate({
        target: products.id,
        set: {
          sku: sql`excluded.sku`,
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          unit: sql`excluded.unit`,
          priceMinor: sql`excluded.price_minor`,
          priceCurrency: sql`excluded.price_currency`,
          costMinor: sql`excluded.cost_minor`,
          costCurrency: sql`excluded.cost_currency`,
          taxable: sql`excluded.taxable`,
          trackStock: sql`excluded.track_stock`,
          onHand: sql`excluded.on_hand`,
          minStock: sql`excluded.min_stock`,
          stockPolicy: sql`excluded.stock_policy`,
          archivedAt: sql`excluded.archived_at`,
        },
      });

    if (movements.length > 0) {
      await this.tx.insert(stockMovements).values(movements);
    }
  }
}
