import { and, asc, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { schema, type Database } from '@corebiz/db';
import { Money, type Currency } from '@corebiz/domain';
import type {
  BestSeller,
  Clock,
  CustomerListItem,
  CustomerOption,
  CustomerQueries,
  DeliveryNoteListItem,
  DeliveryNoteQueries,
  DeliveryNoteView,
  Page,
  ProductListItem,
  ProductOption,
  ProductQueries,
  ReadModels,
  ReportQueries,
  SalesReport,
  TenantContext,
  UsageQueries,
} from '@corebiz/application';
import { decodeCursor, encodeCursor, likePattern, pageLimit } from '../drizzle/pagination';
import { drizzleAdminQueries } from './administration';
import { readOnly } from '../drizzle/session';
import { usagePeriod } from '../drizzle/usage';

const { customers, products, deliveryNotes, deliveryNoteLines, tenantUsage } = schema;

/**
 * Lado de lectura sobre Postgres.
 *
 * No rehidrata agregados: consulta las columnas que la pantalla necesita y
 * devuelve datos planos. La diferencia no es de estilo — pintar veinticinco notas
 * reconstruyendo el agregado significa traer todas sus lineas, sus totales y sus
 * tasas para mostrar un numero y una fecha.
 *
 * Toda lectura va dentro de una transaccion de solo lectura con el contexto del
 * tenant puesto. Fuera de una transaccion las variables de RLS no sobreviven.
 */

/** Una suma de Postgres llega como cadena; convertirla a Number perderia centimos. */
function toMinor(value: string | null): bigint {
  return value === null || value === '' ? 0n : BigInt(value);
}

function money(minor: bigint, currency: Currency): string {
  return Money.fromMinor(minor, currency).toString();
}

/** Las cantidades se guardan en escala 3; se muestran sin ceros sobrantes. */
function quantity(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / 1000n;
  const fraction = (abs % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  const sign = negative ? '-' : '';
  return fraction === '' ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}

class DrizzleCustomerQueries implements CustomerQueries {
  constructor(
    private readonly db: Database,
    private readonly ctx: TenantContext,
  ) {}

  list(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<Page<CustomerListItem>> {
    const limit = pageLimit(filter.limit);

    return readOnly(this.db, this.ctx, async (tx) => {
      const conditions = [eq(customers.tenantId, this.ctx.tenantId)];
      if (filter.includeArchived !== true) conditions.push(isNull(customers.archivedAt));

      if (filter.search !== undefined && filter.search.trim() !== '') {
        const pattern = likePattern(filter.search);
        const match = or(
          ilike(customers.name, pattern),
          ilike(customers.code, pattern),
          ilike(customers.taxId, pattern),
        );
        if (match !== undefined) conditions.push(match);
      }

      const cursor = decodeCursor(filter.cursor);
      if (cursor !== null) {
        conditions.push(sql`(${customers.name}, ${customers.id}) > (${cursor.sort}, ${cursor.id})`);
      }

      const rows = await tx
        .select({
          id: customers.id,
          code: customers.code,
          name: customers.name,
          taxId: customers.taxId,
          creditLimitMinor: customers.creditLimitMinor,
          creditLimitCurrency: customers.creditLimitCurrency,
        })
        .from(customers)
        .where(and(...conditions))
        .orderBy(asc(customers.name), asc(customers.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const visible = hasMore ? rows.slice(0, limit) : rows;
      const last = visible[visible.length - 1];

      return {
        items: visible.map((row): CustomerListItem => ({
          id: row.id,
          code: row.code,
          name: row.name,
          taxId: row.taxId,
          creditLimit:
            row.creditLimitMinor === null || row.creditLimitCurrency === null
              ? null
              : money(row.creditLimitMinor, row.creditLimitCurrency as Currency),
        })),
        nextCursor: hasMore && last !== undefined ? encodeCursor(last.name, last.id) : null,
      };
    });
  }

  options(limit = 500): Promise<readonly CustomerOption[]> {
    return readOnly(this.db, this.ctx, async (tx) => {
      const rows = await tx
        .select({ id: customers.id, code: customers.code, name: customers.name })
        .from(customers)
        .where(and(eq(customers.tenantId, this.ctx.tenantId), isNull(customers.archivedAt)))
        .orderBy(asc(customers.name))
        .limit(pageLimit(limit));

      return rows;
    });
  }
}

/** Traduccion del getter `isBelowMinimum` del dominio a SQL. */
const BELOW_MINIMUM = sql<boolean>`${products.trackStock} and ${products.minStock} is not null and ${products.onHand} < ${products.minStock}`;

class DrizzleProductQueries implements ProductQueries {
  constructor(
    private readonly db: Database,
    private readonly ctx: TenantContext,
  ) {}

  list(filter: { search?: string; limit?: number }): Promise<Page<ProductListItem>> {
    const limit = pageLimit(filter.limit);

    return readOnly(this.db, this.ctx, async (tx) => {
      const conditions = [eq(products.tenantId, this.ctx.tenantId), isNull(products.archivedAt)];

      if (filter.search !== undefined && filter.search.trim() !== '') {
        const pattern = likePattern(filter.search);
        const match = or(ilike(products.name, pattern), ilike(products.sku, pattern));
        if (match !== undefined) conditions.push(match);
      }

      const rows = await tx
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          unit: products.unit,
          priceMinor: products.priceMinor,
          priceCurrency: products.priceCurrency,
          trackStock: products.trackStock,
          onHand: products.onHand,
          belowMinimum: BELOW_MINIMUM,
        })
        .from(products)
        .where(and(...conditions))
        .orderBy(asc(products.name), asc(products.id))
        .limit(limit);

      return {
        items: rows.map((row): ProductListItem => ({
          id: row.id,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          price: money(row.priceMinor, row.priceCurrency as Currency),
          trackStock: row.trackStock,
          onHand: row.trackStock ? quantity(row.onHand) : null,
          belowMinimum: row.belowMinimum,
        })),
        nextCursor: null,
      };
    });
  }

  options(limit = 500): Promise<readonly ProductOption[]> {
    return readOnly(this.db, this.ctx, async (tx) => {
      const rows = await tx
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          unit: products.unit,
          priceMinor: products.priceMinor,
          priceCurrency: products.priceCurrency,
          trackStock: products.trackStock,
          onHand: products.onHand,
        })
        .from(products)
        .where(and(eq(products.tenantId, this.ctx.tenantId), isNull(products.archivedAt)))
        .orderBy(asc(products.name))
        .limit(pageLimit(limit));

      return rows.map((row): ProductOption => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        unit: row.unit,
        price: money(row.priceMinor, row.priceCurrency as Currency),
        stock: row.trackStock ? quantity(row.onHand) : null,
      }));
    });
  }
}

class DrizzleDeliveryNoteQueries implements DeliveryNoteQueries {
  constructor(
    private readonly db: Database,
    private readonly ctx: TenantContext,
  ) {}

  list(filter: { status?: string; limit?: number }): Promise<Page<DeliveryNoteListItem>> {
    const limit = pageLimit(filter.limit);

    return readOnly(this.db, this.ctx, async (tx) => {
      const conditions = [eq(deliveryNotes.tenantId, this.ctx.tenantId)];
      if (filter.status !== undefined) conditions.push(eq(deliveryNotes.status, filter.status));

      // El nombre del cliente se resuelve con un JOIN. La version anterior traia
      // quinientos clientes a memoria para construir un diccionario y buscar en
      // el; esto es lo que una base de datos relacional sabe hacer sola.
      const rows = await tx
        .select({
          id: deliveryNotes.id,
          number: deliveryNotes.number,
          status: deliveryNotes.status,
          customerName: customers.name,
          totalMinor: deliveryNotes.totalMinor,
          currency: deliveryNotes.currency,
          totalSecondaryMinor: deliveryNotes.totalSecondaryMinor,
          secondaryCurrency: deliveryNotes.exchangeRateTo,
          issuedAt: deliveryNotes.issuedAt,
        })
        .from(deliveryNotes)
        .innerJoin(customers, eq(customers.id, deliveryNotes.customerId))
        .where(and(...conditions))
        .orderBy(desc(deliveryNotes.number))
        .limit(limit);

      return {
        items: rows.map((row): DeliveryNoteListItem => ({
          id: row.id,
          number: row.number,
          status: row.status,
          customerName: row.customerName,
          total: money(row.totalMinor, row.currency as Currency),
          totalSecondary: money(row.totalSecondaryMinor, row.secondaryCurrency as Currency),
          issuedAt: row.issuedAt,
        })),
        nextCursor: null,
      };
    });
  }

  findById(id: string): Promise<DeliveryNoteView | null> {
    return readOnly(this.db, this.ctx, async (tx) => {
      const headers = await tx
        .select({ note: deliveryNotes, customerName: customers.name })
        .from(deliveryNotes)
        .innerJoin(customers, eq(customers.id, deliveryNotes.customerId))
        .where(and(eq(deliveryNotes.tenantId, this.ctx.tenantId), eq(deliveryNotes.id, id)))
        .limit(1);

      const header = headers[0];
      if (header === undefined) return null;

      const note = header.note;
      const currency = note.currency as Currency;
      const secondary = note.exchangeRateTo as Currency;

      const lines = await tx
        .select()
        .from(deliveryNoteLines)
        .where(eq(deliveryNoteLines.deliveryNoteId, note.id))
        .orderBy(asc(deliveryNoteLines.lineNo));

      return {
        id: note.id,
        number: note.number,
        status: note.status,
        customerName: header.customerName,
        issuedAt: note.issuedAt,
        // La tasa se muestra con su fecha de captura. Sin la fecha, el dato
        // invita a leerse como la tasa de hoy, que es justo lo que no es.
        exchangeRate: formatRate(note.exchangeRateScaled),
        exchangeRateAt: note.exchangeRateAt,
        taxLabel: note.taxLabelSnapshot,
        voidReason: note.voidReason,
        lines: lines.map((line) => ({
          lineNo: line.lineNo,
          description: line.descriptionSnapshot,
          unit: line.unitSnapshot,
          quantity: quantity(line.quantity),
          unitPrice: money(line.unitPriceMinor, currency),
          discountBp: line.discountBp,
          lineTotal: money(line.lineTotalMinor, currency),
        })),
        subtotal: money(note.subtotalMinor, currency),
        tax: money(note.taxMinor, currency),
        total: money(note.totalMinor, currency),
        totalSecondary: money(note.totalSecondaryMinor, secondary),
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

class DrizzleUsageQueries implements UsageQueries {
  constructor(
    private readonly db: Database,
    private readonly ctx: TenantContext,
    private readonly clock: Clock,
  ) {}

  current(resource: string): Promise<number> {
    return readOnly(this.db, this.ctx, async (tx) => {
      const rows = await tx
        .select({ count: tenantUsage.count })
        .from(tenantUsage)
        .where(
          and(
            eq(tenantUsage.tenantId, this.ctx.tenantId),
            eq(tenantUsage.resource, resource),
            eq(tenantUsage.period, usagePeriod(resource, this.clock.now())),
          ),
        )
        .limit(1);

      return rows[0]?.count ?? 0;
    });
  }
}

class DrizzleReportQueries implements ReportQueries {
  constructor(
    private readonly db: Database,
    private readonly ctx: TenantContext,
  ) {}

  /**
   * Ventas, inventario y ranking, calculados por Postgres.
   *
   * Las notas ANULADAS quedan fuera: incluirlas inflaria las cifras con
   * documentos que el negocio ya revirtio.
   *
   * El valor de inventario se calcula en `numeric` y no en coma flotante. Un
   * `double precision` daria un resultado plausible y equivocado por centimos, y
   * el redondeo tiene que coincidir con el que hace el dominio.
   */
  salesSummary(): Promise<SalesReport> {
    const currency = this.ctx.settings.baseCurrency;

    return readOnly(this.db, this.ctx, async (tx) => {
      const active = and(
        eq(deliveryNotes.tenantId, this.ctx.tenantId),
        ne(deliveryNotes.status, 'voided'),
      );

      const [sales] = await tx
        .select({
          total: sql<string>`coalesce(sum(${deliveryNotes.totalMinor}), 0)::text`,
          documents: sql<string>`count(*)::text`,
        })
        .from(deliveryNotes)
        .where(active);

      const [inventory] = await tx
        .select({
          value: sql<string>`coalesce(sum(round(${products.priceMinor}::numeric * ${products.onHand} / 1000)), 0)::text`,
        })
        .from(products)
        .where(
          and(
            eq(products.tenantId, this.ctx.tenantId),
            isNull(products.archivedAt),
            eq(products.trackStock, true),
          ),
        );

      const ranking = await tx
        .select({
          name: deliveryNoteLines.descriptionSnapshot,
          units: sql<string>`sum(${deliveryNoteLines.quantity})::text`,
          revenue: sql<string>`sum(${deliveryNoteLines.lineTotalMinor})::text`,
        })
        .from(deliveryNoteLines)
        .innerJoin(deliveryNotes, eq(deliveryNotes.id, deliveryNoteLines.deliveryNoteId))
        .where(
          and(
            eq(deliveryNoteLines.tenantId, this.ctx.tenantId),
            ne(deliveryNotes.status, 'voided'),
          ),
        )
        .groupBy(deliveryNoteLines.descriptionSnapshot)
        .orderBy(desc(sql`sum(${deliveryNoteLines.quantity})`))
        .limit(5);

      const salesTotal = toMinor(sales?.total ?? null);
      const documentCount = Number(sales?.documents ?? '0');

      return {
        currency,
        salesTotal: money(salesTotal, currency),
        // Division entera, igual que en el dominio: el ticket medio es dinero, y
        // el dinero no admite decimales por debajo del centimo.
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

export function drizzleReadModels(db: Database, ctx: TenantContext, clock: Clock): ReadModels {
  return {
    customers: new DrizzleCustomerQueries(db, ctx),
    products: new DrizzleProductQueries(db, ctx),
    deliveryNotes: new DrizzleDeliveryNoteQueries(db, ctx),
    usage: new DrizzleUsageQueries(db, ctx, clock),
    reports: new DrizzleReportQueries(db, ctx),
    admin: drizzleAdminQueries(db, ctx),
  };
}
