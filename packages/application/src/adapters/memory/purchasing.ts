import type { GoodsReceipt, Supplier, SupplierId, TenantId } from '@corebiz/domain';
import type { GoodsReceiptRepository, SupplierRepository } from '../../ports/purchasing';
import type { Page } from '../../ports/repositories';

/**
 * Adaptadores de compras en memoria.
 *
 * Como los demas dobles, filtran por tenant SIEMPRE. Un test que pase en memoria
 * sin ese filtro ocultaria una fuga que el adaptador de Postgres si tendria.
 */

export class InMemorySupplierRepository implements SupplierRepository {
  constructor(
    private readonly store: Map<string, Supplier>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): Supplier[] {
    return [...this.store.values()].filter((s) => s.tenantId === this.tenantId);
  }

  findById(id: SupplierId): Promise<Supplier | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findByCode(code: string): Promise<Supplier | null> {
    const normalized = code.trim().toUpperCase();
    return Promise.resolve(this.scoped().find((s) => s.code === normalized) ?? null);
  }

  list(filter: { search?: string; limit?: number; cursor?: string }): Promise<Page<Supplier>> {
    let items = this.scoped().filter((s) => !s.isArchived);

    if (filter.search !== undefined && filter.search !== '') {
      const needle = filter.search.toLowerCase();
      items = items.filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          s.code.toLowerCase().includes(needle) ||
          (s.taxId?.toLowerCase().includes(needle) ?? false),
      );
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const limit = filter.limit ?? 25;
    const start = filter.cursor !== undefined ? Number(filter.cursor) : 0;
    const slice = items.slice(start, start + limit);

    return Promise.resolve({
      items: slice,
      nextCursor: start + limit < items.length ? String(start + limit) : null,
    });
  }

  save(supplier: Supplier): Promise<void> {
    this.store.set(supplier.id, supplier);
    return Promise.resolve();
  }
}

export class InMemoryGoodsReceiptRepository implements GoodsReceiptRepository {
  constructor(
    private readonly store: Map<string, GoodsReceipt>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): GoodsReceipt[] {
    return [...this.store.values()].filter((r) => r.tenantId === this.tenantId);
  }

  findById(id: string): Promise<GoodsReceipt | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findByNumber(number: string): Promise<GoodsReceipt | null> {
    return Promise.resolve(this.scoped().find((r) => r.number === number) ?? null);
  }

  list(filter: { supplierId?: string; limit?: number }): Promise<Page<GoodsReceipt>> {
    let items = this.scoped();

    if (filter.supplierId !== undefined) {
      items = items.filter((r) => r.supplierId === filter.supplierId);
    }

    // De la mas reciente a la mas antigua, igual que el registro de ventas.
    items.sort((a, b) => (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0));

    return Promise.resolve({ items: items.slice(0, filter.limit ?? 25), nextCursor: null });
  }

  save(receipt: GoodsReceipt): Promise<void> {
    this.store.set(receipt.id, receipt);
    return Promise.resolve();
  }
}
