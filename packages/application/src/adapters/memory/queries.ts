import {
  Money,
  type CustomerAddress,
  type Currency,
  type GoodsReceipt,
  type Product,
  type Supplier,
  type TenantId,
} from '@corebiz/domain';
import type { Page } from '../../ports/repositories';
import type {
  AdminQueries,
  AuditEntryView,
  AuditFilter,
  BestSeller,
  GoodsReceiptLineView,
  GoodsReceiptListItem,
  GoodsReceiptView,
  CustomerDetail,
  CustomerListItem,
  CustomerOption,
  CustomerQueries,
  DeliveryNoteListItem,
  DeliveryNoteQueries,
  DeliveryNoteView,
  ProductDetail,
  ProductListItem,
  ProductOption,
  ProductQueries,
  StockMovementItem,
  ReadModels,
  PendingInvitationView,
  PurchasingQueries,
  ReportQueries,
  SalesReport,
  SupplierListItem,
  SupplierOption,
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
        archived: c.isArchived,
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

  byId(id: string): Promise<CustomerDetail | null> {
    // Se busca dentro del tenant y no por identificador global: pedir la ficha de
    // otro comercio tiene que responder "no existe", no "no puedes".
    const found = this.scoped().find((c) => c.id === id);
    if (found === undefined) return Promise.resolve(null);

    const snapshot = found.snapshot();
    return Promise.resolve({
      id: found.id,
      code: found.code,
      name: found.name,
      taxId: found.taxId,
      creditLimit: found.creditLimit?.toString() ?? null,
      archived: found.isArchived,
      email: snapshot.email,
      phone: snapshot.phone,
      // La direccion viaja como una linea legible: la ficha la pinta, no la edita.
      address: formatAddress(snapshot.address),
    });
  }
}

class InMemoryProductQueries implements ProductQueries {
  constructor(
    private readonly stores: SalesStores,
    private readonly tenantId: TenantId,
  ) {}

  private scoped() {
    return [...this.stores.products.values()]
      .filter((p) => p.tenantId === this.tenantId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  list(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<Page<ProductListItem>> {
    const items = this.scoped()
      .filter((p) => filter.includeArchived === true || !p.isArchived)
      .filter((p) => matches([p.name, p.sku], filter.search ?? ''))
      .map((p): ProductListItem => this.toListItem(p));

    return Promise.resolve(page(items, filter.limit ?? 25));
  }

  private toListItem(p: Product): ProductListItem {
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      price: p.price.toString(),
      trackStock: p.trackStock,
      onHand: p.trackStock ? p.onHand.toCompactString() : null,
      belowMinimum: p.isBelowMinimum,
      archived: p.isArchived,
    };
  }

  byId(id: string): Promise<ProductDetail | null> {
    const found = this.scoped().find((p) => p.id === id);
    if (found === undefined) return Promise.resolve(null);

    const snapshot = found.snapshot();
    return Promise.resolve({
      ...this.toListItem(found),
      cost: snapshot.cost?.toString() ?? null,
      minStock: snapshot.minStock?.toCompactString() ?? null,
      taxable: snapshot.taxable,
    });
  }

  movements(productId: string, limit = 50): Promise<readonly StockMovementItem[]> {
    const mine = new Set<string>(this.scoped().map((p) => p.id));
    if (!mine.has(productId)) return Promise.resolve([]);

    const items = this.stores.stockMovements
      .filter((m) => m.productId === productId)
      .slice()
      .reverse()
      .slice(0, limit)
      .map((m): StockMovementItem => ({
        at: m.at,
        kind: m.kind,
        quantity: m.quantity,
        balance: m.balance,
        reason: m.reason,
        reference: m.reference,
      }));

    return Promise.resolve(items);
  }

  options(limit = 500): Promise<readonly ProductOption[]> {
    const items = this.scoped()
      .filter((p) => !p.isArchived)
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
    purchasing: new InMemoryPurchasingQueries(stores, tenantId),
  };
}

/**
 * Lado de lectura de compras, en memoria.
 *
 * Deriva los mismos modelos planos que la version SQL recorriendo los agregados
 * del almacen. El nombre del proveedor se resuelve aqui, en lugar de guardarse
 * en el documento: a diferencia del nombre del PRODUCTO en una linea —que se
 * congela porque describe lo que se recibio— el proveedor es una referencia
 * viva, y si cambia de razon social conviene ver la actual.
 */
class InMemoryPurchasingQueries implements PurchasingQueries {
  constructor(
    private readonly stores: SalesStores,
    private readonly tenantId: TenantId,
  ) {}

  private scopedSuppliers(): Supplier[] {
    return ([...this.stores.suppliers.values()] as Supplier[]).filter(
      (s) => s.tenantId === this.tenantId,
    );
  }

  suppliers(filter: {
    search?: string;
    limit?: number;
    cursor?: string;
  }): Promise<Page<SupplierListItem>> {
    let items = this.scopedSuppliers();

    if (filter.search !== undefined && filter.search !== '') {
      const needle = filter.search.toLowerCase();
      items = items.filter(
        (s) => s.name.toLowerCase().includes(needle) || s.code.toLowerCase().includes(needle),
      );
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const limit = filter.limit ?? 25;
    const start = filter.cursor !== undefined ? Number(filter.cursor) : 0;
    const slice = items.slice(start, start + limit);

    return Promise.resolve({
      items: slice.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        taxId: s.taxId,
        contactName: s.contactName,
        phone: s.phone,
        archived: s.isArchived,
      })),
      nextCursor: start + limit < items.length ? String(start + limit) : null,
    });
  }

  supplierOptions(limit = 500): Promise<readonly SupplierOption[]> {
    return Promise.resolve(
      this.scopedSuppliers()
        .slice(0, limit)
        .map((s) => ({ id: s.id, code: s.code, name: s.name })),
    );
  }

  receipts(filter: { limit?: number }): Promise<Page<GoodsReceiptListItem>> {
    const byId = new Map(this.scopedSuppliers().map((s) => [s.id as string, s.name]));

    const items = ([...this.stores.goodsReceipts.values()] as GoodsReceipt[])
      .filter((r) => r.tenantId === this.tenantId)
      .sort((a, b) => (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0))
      .slice(0, filter.limit ?? 25);

    return Promise.resolve({
      items: items.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        supplierName: byId.get(r.supplierId) ?? '—',
        total: r.total.toString(),
        lineCount: r.lines.length,
        receivedAt: r.receivedAt,
      })),
      nextCursor: null,
    });
  }

  receiptById(id: string): Promise<GoodsReceiptView | null> {
    const found = ([...this.stores.goodsReceipts.values()] as GoodsReceipt[]).find(
      (r) => r.id === id && r.tenantId === this.tenantId,
    );
    if (found === undefined) return Promise.resolve(null);

    const supplier = this.scopedSuppliers().find((s) => s.id === found.supplierId);
    const props = found.snapshot;

    return Promise.resolve({
      id: found.id,
      number: found.number,
      status: found.status,
      supplierName: supplier?.name ?? '—',
      supplierCode: supplier?.code ?? '—',
      total: found.total.toString(),
      lineCount: found.lines.length,
      receivedAt: found.receivedAt,
      supplierReference: props.supplierReference,
      notes: props.notes,
      voidReason: found.voidReason,
      lines: found.lines.map((line): GoodsReceiptLineView => ({
        lineNo: line.lineNo,
        description: line.descriptionSnapshot,
        unit: line.unitSnapshot,
        quantity: line.quantity.toCompactString(),
        unitCost: line.unitCost.toString(),
        lineTotal: line.lineTotal.toString(),
      })),
    });
  }
}

/**
 * La direccion, en una linea.
 *
 * Se compone aqui y no en el componente porque el adaptador de Postgres tiene que
 * componerla exactamente igual: si cada uno la formatea a su manera, la misma ficha
 * se lee distinta segun el driver.
 */
function formatAddress(address: CustomerAddress | null): string | null {
  if (address === null) return null;
  const parts = [address.line1, address.city, address.state, address.notes].filter(
    (part): part is string => typeof part === 'string' && part.trim() !== '',
  );
  return parts.length === 0 ? null : parts.join(', ');
}
