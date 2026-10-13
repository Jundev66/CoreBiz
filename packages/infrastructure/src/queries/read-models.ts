import type { Currency } from '@corebiz/domain';
import type {
  BestSeller,
  Clock,
  CustomerDetail,
  CustomerListItem,
  CustomerOption,
  CustomerQueries,
  CustomerReceivableItem,
  DeliveryNoteListItem,
  DeliveryNoteQueries,
  DeliveryNoteView,
  Page,
  PaymentAllocationView,
  PaymentListItem,
  PaymentQueries,
  PaymentView,
  ProductDetail,
  ProductListItem,
  ProductOption,
  ProductQueries,
  StockMovementItem,
  ReadModels,
  ReportQueries,
  SalesReport,
  TenantContext,
  UsageQueries,
} from '@corebiz/application';
import type { PrismaClient } from '@corebiz/prisma-client';
import { decodeCursor, encodeCursor, escapeLikeWildcards, pageLimit } from '../prisma/pagination';
import { isRowKey } from '../prisma/record-id';
import { prismaAdminQueries } from './administration';
import { prismaPurchasingQueries } from './purchasing';
import { readOnly } from '../prisma/session';
import { money, quantity, toMinor } from './format';
import { usagePeriod } from '../prisma/usage';

/**
 * Lado de lectura sobre Postgres.
 *
 * No rehidrata agregados: consulta las columnas que la pantalla necesita y devuelve datos
 * planos. La diferencia no es de estilo — pintar veinticinco notas reconstruyendo el
 * agregado significa traer todas sus lineas, sus totales y sus tasas para mostrar un
 * numero y una fecha.
 *
 * Toda lectura va dentro de una transaccion de solo lectura con el contexto del tenant
 * puesto. Fuera de una transaccion las variables de RLS no sobreviven.
 */

/**
 * El equivalente de `(nombre, id) > (sort, id)`.
 *
 * Prisma no expresa comparacion de tuplas. Esta forma con OR pide exactamente lo mismo y
 * sigue apoyandose en el indice `(name, id)`: primero los nombres mayores, y para el
 * nombre exacto del cursor, los identificadores mayores. Sin la segunda rama, dos
 * registros con el mismo nombre harian que la paginacion se saltase uno.
 */
function despuesDelCursor(cursor: { sort: string; id: string }) {
  return {
    OR: [{ name: { gt: cursor.sort } }, { name: cursor.sort, id: { gt: cursor.id } }],
  };
}

/**
 * Busqueda por texto en varias columnas.
 *
 * `contains` NO escapa los comodines —se comprobo contra la base— asi que el termino se
 * neutraliza antes de entregarselo.
 */
function coincideCon(campos: readonly string[], search: string) {
  const termino = escapeLikeWildcards(search);
  return { OR: campos.map((campo) => ({ [campo]: { contains: termino, mode: 'insensitive' } })) };
}

/** Traduccion del getter `isBelowMinimum` del dominio. */
function bajoMinimo(p: {
  track_stock: boolean;
  min_stock: bigint | null;
  on_hand: bigint;
}): boolean {
  return p.track_stock && p.min_stock !== null && p.on_hand < p.min_stock;
}

class PrismaCustomerQueries implements CustomerQueries {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  list(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<Page<CustomerListItem>> {
    const limit = pageLimit(filter.limit);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const cursor = decodeCursor(filter.cursor);
      const search = filter.search?.trim() ?? '';

      const rows = await tx.customers.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          tax_id: true,
          credit_limit_minor: true,
          credit_limit_currency: true,
          archived_at: true,
        },
        where: {
          tenant_id: this.ctx.tenantId,
          ...(filter.includeArchived !== true ? { archived_at: null } : {}),
          ...(search !== '' ? coincideCon(['name', 'code', 'tax_id'], search) : {}),
          ...(cursor !== null ? despuesDelCursor(cursor) : {}),
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      });

      const hasMore = rows.length > limit;
      const visible = hasMore ? rows.slice(0, limit) : rows;
      const last = visible[visible.length - 1];

      return {
        items: visible.map((row): CustomerListItem => ({
          id: row.id,
          code: row.code,
          name: row.name,
          taxId: row.tax_id,
          creditLimit:
            row.credit_limit_minor === null || row.credit_limit_currency === null
              ? null
              : money(row.credit_limit_minor, row.credit_limit_currency as Currency),
          archived: row.archived_at !== null,
        })),
        nextCursor: hasMore && last !== undefined ? encodeCursor(last.name, last.id) : null,
      };
    });
  }

  options(limit = 500): Promise<readonly CustomerOption[]> {
    return readOnly(this.prisma, this.ctx, (tx) =>
      tx.customers.findMany({
        select: { id: true, code: true, name: true },
        where: { tenant_id: this.ctx.tenantId, archived_at: null },
        orderBy: { name: 'asc' },
        take: pageLimit(limit),
      }),
    );
  }

  /**
   * La ficha de un cliente.
   *
   * Va acotada por `tenant_id` ademas de por identificador, y eso no sobra aunque RLS ya
   * lo garantice: un id ajeno tiene que responder "no existe", no "no puedes". La
   * diferencia importa — un 403 confirma que el recurso existe, y eso ya es informacion
   * sobre la empresa de otro.
   */
  byId(id: string): Promise<CustomerDetail | null> {
    // Text that cannot be a key does not exist, and asking would cost a 500: see
    // `prisma/record-id.ts`.
    if (!isRowKey(id)) return Promise.resolve(null);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const row = await tx.customers.findFirst({
        where: { tenant_id: this.ctx.tenantId, id },
      });
      if (row === null) return null;

      return {
        id: row.id,
        code: row.code,
        name: row.name,
        taxId: row.tax_id,
        creditLimit:
          row.credit_limit_minor === null || row.credit_limit_currency === null
            ? null
            : money(row.credit_limit_minor, row.credit_limit_currency as Currency),
        archived: row.archived_at !== null,
        email: row.email,
        phone: row.phone,
        // Dos formas de la misma direccion, y las dos hacen falta: la linea legible
        // la pinta la ficha y el papel; las partes las rellena el formulario de
        // edicion, que no puede deshacer el formato sin adivinar donde acaba la calle.
        address: formatAddress(row.address),
        addressLine1: partOfAddress(row.address, 'line1'),
        addressCity: partOfAddress(row.address, 'city'),
        addressState: partOfAddress(row.address, 'state'),
      };
    });
  }
}

/**
 * La direccion, en una linea.
 *
 * Se compone igual que en el adaptador de memoria, y tiene que seguir siendolo: si cada
 * uno la formatea a su manera, la misma ficha se lee distinta segun el driver.
 */
function formatAddress(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const address = raw as Record<string, unknown>;
  const parts = [address.line1, address.city, address.state, address.notes].filter(
    (part): part is string => typeof part === 'string' && part.trim() !== '',
  );
  return parts.length === 0 ? null : parts.join(', ');
}

/**
 * Una parte suelta de la direccion, tal y como se guardo.
 *
 * La columna es JSON, asi que su contenido no lo garantiza el esquema: se comprueba que
 * lo que hay es texto en lugar de confiar en que lo sea. Una direccion guardada por una
 * version anterior con otra forma devuelve null, que es lo que el formulario sabe pintar.
 */
function partOfAddress(raw: unknown, key: 'line1' | 'city' | 'state'): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

class PrismaProductQueries implements ProductQueries {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  list(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<Page<ProductListItem>> {
    const limit = pageLimit(filter.limit);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const cursor = decodeCursor(filter.cursor);
      const search = filter.search?.trim() ?? '';

      const rows = await tx.products.findMany({
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          price_minor: true,
          price_currency: true,
          track_stock: true,
          on_hand: true,
          min_stock: true,
          archived_at: true,
        },
        where: {
          tenant_id: this.ctx.tenantId,
          ...(filter.includeArchived !== true ? { archived_at: null } : {}),
          ...(search !== '' ? coincideCon(['name', 'sku'], search) : {}),
          ...(cursor !== null ? despuesDelCursor(cursor) : {}),
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      });

      const hasMore = rows.length > limit;
      const visible = hasMore ? rows.slice(0, limit) : rows;
      const last = visible[visible.length - 1];

      return {
        items: visible.map((row): ProductListItem => ({
          id: row.id,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          price: money(row.price_minor, row.price_currency as Currency),
          trackStock: row.track_stock,
          onHand: row.track_stock ? quantity(row.on_hand) : null,
          // Se compara en JavaScript y no en SQL: es una comparacion entre dos columnas
          // de la misma fila, que el DSL de Prisma no expresa. Las tres columnas ya
          // vienen en el select, asi que no cuesta ni un viaje mas.
          belowMinimum: bajoMinimo(row),
          archived: row.archived_at !== null,
        })),
        nextCursor: hasMore && last !== undefined ? encodeCursor(last.name, last.id) : null,
      };
    });
  }

  lowStock(limit = 10): Promise<readonly ProductListItem[]> {
    return readOnly(this.prisma, this.ctx, async (tx) => {
      // SQL and not the query DSL: the condition compares two columns of the same row,
      // which Prisma cannot express, and the whole point is to not fetch the catalogue to
      // filter it here. The tenant filter is explicit as well as enforced by RLS.
      const rows = await tx.$queryRaw<
        {
          id: string;
          sku: string;
          name: string;
          unit: string;
          price_minor: bigint;
          price_currency: string;
          on_hand: bigint;
        }[]
      >`
        select id, sku, name, unit, price_minor, price_currency, on_hand
          from public.products
         where tenant_id = ${this.ctx.tenantId}::uuid
           and archived_at is null
           and track_stock
           and min_stock is not null
           and on_hand < min_stock
         order by name, id
         limit ${pageLimit(limit)}
      `;

      return rows.map((row): ProductListItem => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        unit: row.unit,
        price: money(row.price_minor, row.price_currency as Currency),
        trackStock: true,
        onHand: quantity(row.on_hand),
        belowMinimum: true,
        archived: false,
      }));
    });
  }

  byId(id: string): Promise<ProductDetail | null> {
    if (!isRowKey(id)) return Promise.resolve(null);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const p = await tx.products.findFirst({ where: { tenant_id: this.ctx.tenantId, id } });
      if (p === null) return null;

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        price: money(p.price_minor, p.price_currency as Currency),
        trackStock: p.track_stock,
        onHand: p.track_stock ? quantity(p.on_hand) : null,
        belowMinimum: bajoMinimo(p),
        archived: p.archived_at !== null,
        cost: p.cost_minor === null ? null : money(p.cost_minor, p.price_currency as Currency),
        minStock: p.min_stock === null ? null : quantity(p.min_stock),
        taxable: p.taxable,
        description: p.description,
      };
    });
  }

  /**
   * El libro de movimientos del producto.
   *
   * Del mas reciente al mas antiguo, que es el orden en que se mira: quien abre esto casi
   * siempre viene de por que el saldo dice ocho, y la respuesta esta arriba.
   *
   * El saldo se lee de la columna, NO se recalcula sumando. Recalcularlo haria que la
   * pantalla cuadrase siempre, incluso si el saldo guardado estuviera mal — y esta
   * pantalla existe precisamente para poder detectar eso.
   */
  movements(productId: string, limit = 50): Promise<readonly StockMovementItem[]> {
    if (!isRowKey(productId)) return Promise.resolve([]);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const rows = await tx.stock_movements.findMany({
        where: { tenant_id: this.ctx.tenantId, product_id: productId },
        orderBy: { occurred_at: 'desc' },
        take: pageLimit(limit),
      });

      return rows.map((row): StockMovementItem => ({
        at: row.occurred_at,
        kind: row.kind,
        quantity: quantity(row.quantity),
        balance: quantity(row.balance_after),
        reason: row.note,
        reference: row.ref_type === null ? null : `${row.ref_type}:${row.ref_id ?? ''}`,
      }));
    });
  }

  options(limit = 500): Promise<readonly ProductOption[]> {
    return readOnly(this.prisma, this.ctx, async (tx) => {
      const rows = await tx.products.findMany({
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          price_minor: true,
          price_currency: true,
          cost_minor: true,
          track_stock: true,
          on_hand: true,
        },
        where: { tenant_id: this.ctx.tenantId, archived_at: null },
        orderBy: { name: 'asc' },
        take: pageLimit(limit),
      });

      return rows.map((row): ProductOption => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        unit: row.unit,
        price: money(row.price_minor, row.price_currency as Currency),
        stock: row.track_stock ? quantity(row.on_hand) : null,
        cost:
          row.cost_minor === null ? null : money(row.cost_minor, row.price_currency as Currency),
      }));
    });
  }
}

class PrismaDeliveryNoteQueries implements DeliveryNoteQueries {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  list(filter: {
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<Page<DeliveryNoteListItem>> {
    const limit = pageLimit(filter.limit);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      // El nombre del cliente se resuelve con un JOIN. La version anterior traia
      // quinientos clientes a memoria para construir un diccionario y buscar en el; esto
      // es lo que una base de datos relacional sabe hacer sola.
      const rows = await tx.delivery_notes.findMany({
        select: {
          id: true,
          number: true,
          status: true,
          total_minor: true,
          currency: true,
          total_secondary_minor: true,
          exchange_rate_to: true,
          issued_at: true,
          customers: { select: { name: true } },
        },
        where: {
          tenant_id: this.ctx.tenantId,
          ...(filter.status !== undefined ? { status: filter.status } : {}),
          ...(filter.cursor !== undefined ? { number: { lt: filter.cursor } } : {}),
        },
        orderBy: { number: 'desc' },
        take: limit + 1,
      });

      const hasMore = rows.length > limit;
      const visible = hasMore ? rows.slice(0, limit) : rows;
      const last = visible[visible.length - 1];

      return {
        items: visible.map((row): DeliveryNoteListItem => ({
          id: row.id,
          number: row.number,
          status: row.status,
          customerName: row.customers.name,
          currency: row.currency as Currency,
          total: money(row.total_minor, row.currency as Currency),
          totalSecondary: money(row.total_secondary_minor, row.exchange_rate_to as Currency),
          issuedAt: row.issued_at,
        })),
        nextCursor: hasMore && last !== undefined ? last.number : null,
      };
    });
  }

  findById(id: string): Promise<DeliveryNoteView | null> {
    if (!isRowKey(id)) return Promise.resolve(null);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const note = await tx.delivery_notes.findFirst({
        where: { tenant_id: this.ctx.tenantId, id },
        include: {
          customers: { select: { name: true } },
          delivery_note_lines: { orderBy: { line_no: 'asc' } },
        },
      });
      if (note === null) return null;

      const currency = note.currency as Currency;
      const secondary = note.exchange_rate_to as Currency;

      return {
        id: note.id,
        number: note.number,
        status: note.status,
        customerName: note.customers.name,
        currency,
        issuedAt: note.issued_at,
        // La tasa se muestra con su fecha de captura. Sin la fecha, el dato invita a
        // leerse como la tasa de hoy, que es justo lo que no es.
        exchangeRate: formatRate(note.exchange_rate_scaled),
        exchangeRateAt: note.exchange_rate_at,
        taxLabel: note.tax_label_snapshot,
        deliveredAt: note.delivered_at,
        receivedBy: note.received_by,
        voidReason: note.void_reason,
        lines: note.delivery_note_lines.map((line) => ({
          lineNo: line.line_no,
          description: line.description_snapshot,
          unit: line.unit_snapshot,
          quantity: quantity(line.quantity),
          unitPrice: money(line.unit_price_minor, currency),
          discountBp: line.discount_bp,
          lineTotal: money(line.line_total_minor, currency),
        })),
        subtotal: money(note.subtotal_minor, currency),
        tax: money(note.tax_minor, currency),
        total: money(note.total_minor, currency),
        totalSecondary: money(note.total_secondary_minor, secondary),
      };
    });
  }
}

/** La tasa se guarda escalada x10^8; se muestra sin ceros sobrantes. */
function formatRate(scaled: bigint): string {
  const whole = scaled / 100_000_000n;
  const fraction = (scaled % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

class PrismaUsageQueries implements UsageQueries {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ctx: TenantContext,
    private readonly clock: Clock,
  ) {}

  current(resource: string): Promise<number> {
    return readOnly(this.prisma, this.ctx, async (tx) => {
      const row = await tx.tenant_usage.findFirst({
        select: { count: true },
        where: {
          tenant_id: this.ctx.tenantId,
          resource,
          period: usagePeriod(resource, this.clock.now()),
        },
      });

      // `Number` y no el valor tal cual: la columna es `bigint` y Prisma la entrega como
      // `BigInt`, mientras el puerto declara `number`. La conversion va AQUI, en el
      // adaptador, y no en el puerto: cambiar el contrato por un detalle del ORM seria
      // justo lo que la arquitectura hexagonal existe para evitar. Y dejarla sin convertir
      // reventaria mas tarde, al mezclar `BigInt` con `number` en una comparacion.
      return row === null ? 0 : Number(row.count);
    });
  }
}

class PrismaReportQueries implements ReportQueries {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  /**
   * Ventas, inventario y ranking, calculados por Postgres.
   *
   * Las notas ANULADAS quedan fuera: incluirlas inflaria las cifras con documentos que el
   * negocio ya revirtio.
   *
   * El valor de inventario se calcula en `numeric` y no en coma flotante. Un
   * `double precision` daria un resultado plausible y equivocado por centimos, y el
   * redondeo tiene que coincidir con el que hace el dominio.
   *
   * Va en SQL crudo y no por el DSL: son agregaciones con `round(...::numeric...)` y casts
   * a texto para no perder centimos al pasar por un `number` de JavaScript. Prisma no
   * expresa eso, y forzarlo seria peor que escribir el SQL que ya funciona.
   */
  salesSummary(): Promise<SalesReport> {
    const currency = this.ctx.settings.baseCurrency;
    const tenantId = this.ctx.tenantId;

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const [sales] = await tx.$queryRaw<{ total: string; documents: string }[]>`
        select coalesce(sum(total_minor), 0)::text as total,
               count(*)::text                      as documents
          from public.delivery_notes
         where tenant_id = ${tenantId}::uuid and status <> 'voided'
      `;

      const [inventory] = await tx.$queryRaw<{ value: string }[]>`
        select coalesce(sum(round(price_minor::numeric * on_hand / 1000)), 0)::text as value
          from public.products
         where tenant_id = ${tenantId}::uuid and archived_at is null and track_stock
      `;

      const ranking = await tx.$queryRaw<{ name: string; units: string; revenue: string }[]>`
        select l.description_snapshot        as name,
               sum(l.quantity)::text         as units,
               sum(l.line_total_minor)::text as revenue
          from public.delivery_note_lines l
          join public.delivery_notes n on n.id = l.delivery_note_id
         where l.tenant_id = ${tenantId}::uuid and n.status <> 'voided'
         group by l.description_snapshot
         order by sum(l.quantity) desc
         limit 5
      `;

      const salesTotal = toMinor(sales?.total ?? null);
      const documentCount = Number(sales?.documents ?? '0');

      return {
        currency,
        salesTotal: money(salesTotal, currency),
        // Division entera, igual que en el dominio: el ticket medio es dinero, y el dinero
        // no admite decimales por debajo del centimo.
        averageTicket: money(documentCount > 0 ? salesTotal / BigInt(documentCount) : 0n, currency),
        inventoryValue: money(toMinor(inventory?.value ?? null), currency),
        documentCount,
        bestSellers: ranking.map((row): BestSeller => ({
          name: row.name,
          units: Number(toMinor(row.units)) / 1000,
          revenue: money(toMinor(row.revenue), currency),
        })),
      };
    });
  }
}

export class PrismaPaymentQueries implements PaymentQueries {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  list(filter: {
    customerId?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<Page<PaymentListItem>> {
    const limit = pageLimit(filter.limit);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const rows = await tx.payments.findMany({
        where: {
          tenant_id: this.ctx.tenantId,
          ...(filter.customerId !== undefined ? { customer_id: filter.customerId } : {}),
          ...(filter.status !== undefined ? { status: filter.status } : {}),
        },
        include: {
          customers: { select: { name: true } },
        },
        orderBy: { paid_at: 'desc' },
        take: limit,
      });

      return {
        items: rows.map((r): PaymentListItem => ({
          id: r.id,
          number: r.number,
          status: r.status,
          customerId: r.customer_id,
          customerName: r.customers?.name ?? '—',
          amount: money(r.amount_minor, r.currency as Currency),
          currency: r.currency,
          paymentMethod: r.payment_method,
          reference: r.reference,
          paidAt: r.paid_at,
        })),
        nextCursor: null,
      };
    });
  }

  byId(id: string): Promise<PaymentView | null> {
    if (!isRowKey(id)) return Promise.resolve(null);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const row = await tx.payments.findFirst({
        where: { tenant_id: this.ctx.tenantId, id },
        include: {
          customers: { select: { name: true } },
          payment_allocations: {
            include: { delivery_notes: { select: { number: true } } },
          },
        },
      });

      if (!row) return null;

      const currency = row.currency as Currency;

      return {
        id: row.id,
        number: row.number,
        status: row.status,
        customerId: row.customer_id,
        customerName: row.customers?.name ?? '—',
        amount: money(row.amount_minor, currency),
        currency: row.currency,
        paymentMethod: row.payment_method,
        reference: row.reference,
        paidAt: row.paid_at,
        exchangeRate: `${row.exchange_rate_scaled / 1_000_000n}.${(row.exchange_rate_scaled % 1_000_000n).toString().padStart(6, '0')}`,
        notes: row.notes,
        voidReason: row.void_reason,
        voidedAt: row.voided_at,
        allocations: row.payment_allocations.map((a): PaymentAllocationView => ({
          deliveryNoteId: a.delivery_note_id,
          deliveryNoteNumber: a.delivery_notes?.number ?? '—',
          amount: money(a.amount_minor, currency),
        })),
      };
    });
  }

  outstandingBalanceFor(customerId: string, currency: 'USD' | 'VES'): Promise<string> {
    return readOnly(this.prisma, this.ctx, async (tx) => {
      const notes = await tx.delivery_notes.findMany({
        where: {
          tenant_id: this.ctx.tenantId,
          customer_id: customerId,
          status: { not: 'voided' },
        },
        select: { total_minor: true },
      });
      const totalIssued = notes.reduce((acc, n) => acc + BigInt(n.total_minor), 0n);

      const payments = await tx.payments.findMany({
        where: {
          tenant_id: this.ctx.tenantId,
          customer_id: customerId,
          status: { not: 'voided' },
        },
        select: { amount_minor: true },
      });
      const totalPaid = payments.reduce((acc, p) => acc + BigInt(p.amount_minor), 0n);

      const balance = totalIssued > totalPaid ? totalIssued - totalPaid : 0n;
      return money(balance, currency);
    });
  }

  customerReceivables(customerId: string): Promise<readonly CustomerReceivableItem[]> {
    return readOnly(this.prisma, this.ctx, async (tx) => {
      const activeNotes = await tx.delivery_notes.findMany({
        where: {
          tenant_id: this.ctx.tenantId,
          customer_id: customerId,
          status: { not: 'voided' },
        },
        include: {
          payment_allocations: {
            where: {
              payments: { status: { not: 'voided' } },
            },
            select: { amount_minor: true },
          },
        },
        orderBy: { issued_at: 'desc' },
      });

      const results: CustomerReceivableItem[] = [];

      for (const note of activeNotes) {
        const total = BigInt(note.total_minor);
        const paid = note.payment_allocations.reduce((acc, a) => acc + BigInt(a.amount_minor), 0n);
        const remaining = total > paid ? total - paid : 0n;

        if (remaining > 0n) {
          const cur = note.currency as Currency;
          results.push({
            deliveryNoteId: note.id,
            number: note.number,
            issuedAt: note.issued_at,
            total: money(total, cur),
            paidAmount: money(paid, cur),
            balance: money(remaining, cur),
            currency: note.currency,
          });
        }
      }

      return results;
    });
  }
}

export function prismaReadModels(
  prisma: PrismaClient,
  ctx: TenantContext,
  clock: Clock,
): ReadModels {
  return {
    customers: new PrismaCustomerQueries(prisma, ctx),
    products: new PrismaProductQueries(prisma, ctx),
    deliveryNotes: new PrismaDeliveryNoteQueries(prisma, ctx),
    usage: new PrismaUsageQueries(prisma, ctx, clock),
    reports: new PrismaReportQueries(prisma, ctx),
    admin: prismaAdminQueries(prisma, ctx),
    purchasing: prismaPurchasingQueries(prisma, ctx),
    payments: new PrismaPaymentQueries(prisma, ctx),
  };
}
