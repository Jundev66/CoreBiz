import { Money, type Currency, type TenantId } from '@corebiz/domain';
import type { Page } from '../../ports/repositories';
import type {
  AdminQueries,
  AuditEntryView,
  AuditFilter,
  BestSeller,
  CustomerListItem,
  CustomerOption,
  CustomerQueries,
  DeliveryNoteListItem,
  DeliveryNoteQueries,
  DeliveryNoteView,
  ProductListItem,
  ProductOption,
  ProductQueries,
  ReadModels,
  PendingInvitationView,
  ReportQueries,
  SalesReport,
  TeamMemberView,
  UsageQueries,
} from '../../queries/read-models';
import type { SalesStores } from './sales';

/**
 * Lado de lectura en memoria.
 *
 * Deriva los mismos modelos planos que la version SQL, pero recorriendo los
 * agregados del almacen. Existe para que `pnpm dev:nodb` y la suite E2E sigan
 * funcionando sin Postgres, y para que las dos implementaciones tengan que
 * ponerse de acuerdo en un contrato explicito en vez de en lo que devuelva la
 * base de datos.
 */

function page<T>(items: readonly T[], limit: number): Page<T> {
  return { items: items.slice(0, limit), nextCursor: null };
}

function matches(haystack: readonly (string | null)[], needle: string): boolean {
  const term = needle.trim().toLowerCase();
  if (term === '') return true;
  return haystack.some((value) => value !== null && value.toLowerCase().includes(term));
}

class InMemoryCustomerQueries implements CustomerQueries {
  constructor(
    private readonly stores: SalesStores,
    private readonly tenantId: TenantId,
  ) {}

  private scoped() {
    return [...this.stores.customers.values()]
      .filter((c) => c.tenantId === this.tenantId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  list(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<Page<CustomerListItem>> {
    const items = this.scoped()
      .filter((c) => filter.includeArchived === true || !c.isArchived)
      .filter((c) => matches([c.name, c.code, c.taxId], filter.search ?? ''))
      .map((c): CustomerListItem => ({
        id: c.id,
        code: c.code,
        name: c.name,
        taxId: c.taxId,
        creditLimit: c.creditLimit?.toString() ?? null,
      }));

    return Promise.resolve(page(items, filter.limit ?? 25));
  }

  options(limit = 500): Promise<readonly CustomerOption[]> {
    const items = this.scoped()
      .filter((c) => !c.isArchived)
      .slice(0, limit)
      .map((c): CustomerOption => ({ id: c.id, code: c.code, name: c.name }));

    return Promise.resolve(items);
  }
}

class InMemoryProductQueries implements ProductQueries {
  constructor(
    private readonly stores: SalesStores,
    private readonly tenantId: TenantId,
  ) {}

  private scoped() {
    return [...this.stores.products.values()]
      .filter((p) => p.tenantId === this.tenantId && !p.isArchived)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  list(filter: { search?: string; limit?: number }): Promise<Page<ProductListItem>> {
    const items = this.scoped()
      .filter((p) => matches([p.name, p.sku], filter.search ?? ''))
      .map((p): ProductListItem => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        price: p.price.toString(),
        trackStock: p.trackStock,
        onHand: p.trackStock ? p.onHand.toCompactString() : null,
        belowMinimum: p.isBelowMinimum,
      }));

    return Promise.resolve(page(items, filter.limit ?? 25));
  }

  options(limit = 500): Promise<readonly ProductOption[]> {
    const items = this.scoped()
      .slice(0, limit)
      .map((p): ProductOption => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price.toString(),
        unit: p.unit,
        stock: p.trackStock ? p.onHand.toCompactString() : null,
      }));

    return Promise.resolve(items);
  }
}

class InMemoryDeliveryNoteQueries implements DeliveryNoteQueries {
  constructor(
    private readonly stores: SalesStores,
    private readonly tenantId: TenantId,
  ) {}

  private customerName(customerId: string): string {
    return this.stores.customers.get(customerId)?.name ?? '—';
  }

  private scoped() {
    return [...this.stores.deliveryNotes.values()]
      .filter((n) => n.tenantId === this.tenantId)
      .sort((a, b) => b.number.localeCompare(a.number));
  }

  list(filter: { status?: string; limit?: number }): Promise<Page<DeliveryNoteListItem>> {
    const items = this.scoped()
      .filter((n) => filter.status === undefined || n.status === filter.status)
      .map((n): DeliveryNoteListItem => ({
        id: n.id,
        number: n.number,
        status: n.status,
        customerName: this.customerName(n.customerId),
        total: n.totals.total.toString(),
        totalSecondary: n.totals.totalInSecondaryCurrency.toString(),
        issuedAt: n.issuedAt,
      }));

    return Promise.resolve(page(items, filter.limit ?? 25));
  }

  findById(id: string): Promise<DeliveryNoteView | null> {
    const note = this.stores.deliveryNotes.get(id);
    if (note === undefined || note.tenantId !== this.tenantId) return Promise.resolve(null);

    return Promise.resolve({
      id: note.id,
      number: note.number,
      status: note.status,
      customerName: this.customerName(note.customerId),
      issuedAt: note.issuedAt,
      exchangeRate: note.exchangeRate.toCompactString(),
      exchangeRateAt: note.exchangeRate.capturedAt,
      taxLabel: note.taxLabel,
      voidReason: note.voidReason,
      lines: note.lines.map((line) => ({
        lineNo: line.lineNo,
        description: line.descriptionSnapshot,
        unit: line.unitSnapshot,
        quantity: line.quantity.toCompactString(),
        unitPrice: line.unitPrice.toString(),
        discountBp: line.discountBp,
        lineTotal: line.lineTotal.toString(),
      })),
      subtotal: note.totals.subtotal.toString(),
      tax: note.totals.tax.toString(),
      total: note.totals.total.toString(),
      totalSecondary: note.totals.totalInSecondaryCurrency.toString(),
    });
  }
}

class InMemoryUsageQueries implements UsageQueries {
  constructor(
    private readonly stores: SalesStores,
    private readonly tenantId: TenantId,
  ) {}

  current(resource: string): Promise<number> {
    return Promise.resolve(this.stores.usage.get(`${this.tenantId}:${resource}`) ?? 0);
  }
}

class InMemoryReportQueries implements ReportQueries {
  constructor(
    private readonly stores: SalesStores,
    private readonly tenantId: TenantId,
    private readonly currency: Currency,
  ) {}

  salesSummary(): Promise<SalesReport> {
    const zero = Money.zero(this.currency);

    // Las notas anuladas no cuentan como venta: incluirlas inflaria las cifras
    // con documentos que el negocio ya revirtio.
    const active = [...this.stores.deliveryNotes.values()].filter(
      (n) => n.tenantId === this.tenantId && !n.isVoided,
    );

    const salesTotal = active.reduce((acc, note) => {
      const sum = acc.add(note.totals.total);
      return sum.ok ? sum.value : acc;
    }, zero);

    const averageTicket =
      active.length > 0
        ? Money.fromMinor(salesTotal.minorUnits / BigInt(active.length), salesTotal.currency)
        : zero;

    const inventoryValue = [...this.stores.products.values()]
      .filter((p) => p.tenantId === this.tenantId && p.trackStock)
      .reduce((acc, product) => {
        const line = product.price.multiplyScaled(product.onHand.scaledValue, 3);
        const sum = acc.add(line);
        return sum.ok ? sum.value : acc;
      }, zero);

    const ranked = new Map<string, { units: number; revenue: Money }>();
    for (const note of active) {
      for (const line of note.lines) {
        const entry = ranked.get(line.descriptionSnapshot) ?? { units: 0, revenue: zero };
        entry.units += Number(line.quantity.scaledValue) / 1000;
        const sum = entry.revenue.add(line.lineTotal);
        if (sum.ok) entry.revenue = sum.value;
        ranked.set(line.descriptionSnapshot, entry);
      }
    }

    const bestSellers: BestSeller[] = [...ranked.entries()]
      .map(([name, entry]) => ({ name, units: entry.units, revenue: entry.revenue.toString() }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);

    return Promise.resolve({
      currency: this.currency,
      salesTotal: salesTotal.toString(),
      averageTicket: averageTicket.toString(),
      inventoryValue: inventoryValue.toString(),
      documentCount: active.length,
      bestSellers,
    });
  }
}

/**
 * Lado de lectura de administracion, en memoria.
 *
 * Lee de los MISMOS almacenes en los que escriben los casos de uso, incluido el
 * registro de auditoria. Si leyera de otro sitio, el visor mostraria un mundo
 * distinto del que la aplicacion acaba de escribir, y el modulo no se podria
 * probar sin base de datos — que es justo lo que `pnpm dev:nodb` promete.
 */
class InMemoryAdminQueries implements AdminQueries {
  constructor(
    private readonly stores: SalesStores,
    private readonly tenantId: TenantId,
    private readonly viewerId: string,
  ) {}

  team(): Promise<readonly TeamMemberView[]> {
    const members = [...this.stores.members.values()] as {
      tenantId: TenantId;
      userId: string;
      email: string | null;
      role: string;
      joinedAt: Date;
    }[];

    return Promise.resolve(
      members
        .filter((m) => m.tenantId === this.tenantId)
        .map((m) => ({
          userId: m.userId,
          email: m.email,
          role: m.role,
          joinedAt: m.joinedAt,
          isYou: m.userId === this.viewerId,
        }))
        .sort((a, b) => a.role.localeCompare(b.role)),
    );
  }

  pendingInvitations(): Promise<readonly PendingInvitationView[]> {
    const now = new Date();
    const rows = [...this.stores.invitations.values()] as {
      id: string;
      tenantId: TenantId;
      email: string;
      role: string;
      expiresAt: Date;
      acceptedAt: Date | null;
      revokedAt: Date | null;
    }[];

    return Promise.resolve(
      rows
        .filter(
          (i) =>
            i.tenantId === this.tenantId &&
            i.acceptedAt === null &&
            i.revokedAt === null &&
            i.expiresAt > now,
        )
        .map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
    );
  }

  private entries(): {
    id: string;
    tenantId: TenantId;
    occurredAt: Date;
    action: string;
    entityType?: string;
    entityId?: string;
    summary?: Readonly<Record<string, unknown>>;
  }[] {
    return (this.stores.auditEntries as never[]).filter(
      (e: { tenantId: TenantId }) => e.tenantId === this.tenantId,
    );
  }

  auditLog(filter: AuditFilter): Promise<Page<AuditEntryView>> {
    let rows = this.entries();

    if (filter.action !== undefined && filter.action !== '') {
      rows = rows.filter((e) => e.action === filter.action);
    }
    if (filter.from !== undefined) {
      rows = rows.filter((e) => e.occurredAt >= (filter.from as Date));
    }
    if (filter.to !== undefined) {
      rows = rows.filter((e) => e.occurredAt <= (filter.to as Date));
    }

    // Del mas reciente al mas antiguo: quien abre un registro de auditoria busca
    // lo que acaba de pasar, no lo que paso el primer dia.
    rows = [...rows].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const limit = filter.limit ?? 50;
    const start = filter.cursor !== undefined ? Number(filter.cursor) : 0;
    const slice = rows.slice(start, start + limit);

    return Promise.resolve({
      items: slice.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt,
        actorEmail: null,
        action: e.action,
        entityType: e.entityType ?? null,
        entityId: e.entityId ?? null,
        summary: e.summary ?? null,
      })),
      nextCursor: start + limit < rows.length ? String(start + limit) : null,
    });
  }

  auditActions(): Promise<readonly string[]> {
    return Promise.resolve([...new Set(this.entries().map((e) => e.action))].sort());
  }
}

export function inMemoryReadModels(
  stores: SalesStores,
  tenantId: TenantId,
  currency: Currency,
  viewerId = '',
): ReadModels {
  return {
    customers: new InMemoryCustomerQueries(stores, tenantId),
    products: new InMemoryProductQueries(stores, tenantId),
    deliveryNotes: new InMemoryDeliveryNoteQueries(stores, tenantId),
    usage: new InMemoryUsageQueries(stores, tenantId),
    reports: new InMemoryReportQueries(stores, tenantId, currency),
    admin: new InMemoryAdminQueries(stores, tenantId, viewerId),
  };
}
