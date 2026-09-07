import {
  Money,
  type Customer,
  type CustomerId,
  type DeliveryNote,
  type DeliveryNoteId,
  type Product,
  type ProductId,
  type TenantId,
} from '@corebiz/domain';
import type {
  DeliveryNoteRepository,
  DocumentSequences,
  DocumentType,
  Page,
  PaymentQueries,
  ProductRepository,
} from '../../ports/index';

/**
 * Dobles en memoria para catalogo y ventas.
 *
 * Filtran por tenant exactamente como lo hara el adaptador de Postgres, para que un
 * test en verde no esconda una fuga entre empresas.
 */

export class InMemoryProductRepository implements ProductRepository {
  constructor(
    private readonly store: Map<string, Product>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): Product[] {
    return [...this.store.values()].filter((p) => p.tenantId === this.tenantId);
  }

  findById(id: ProductId): Promise<Product | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findBySku(sku: string): Promise<Product | null> {
    const normalized = sku.trim().toUpperCase();
    return Promise.resolve(this.scoped().find((p) => p.sku === normalized) ?? null);
  }

  findManyByIds(ids: readonly ProductId[]): Promise<Product[]> {
    const wanted = new Set<string>(ids);
    return Promise.resolve(this.scoped().filter((p) => wanted.has(p.id)));
  }

  list(filter: {
    search?: string;
    belowMinimum?: boolean;
    limit?: number;
  }): Promise<Page<Product>> {
    let items = this.scoped().filter((p) => !p.isArchived);

    if (filter.search) {
      const needle = filter.search.toLowerCase();
      items = items.filter(
        (p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle),
      );
    }
    if (filter.belowMinimum) {
      items = items.filter((p) => p.isBelowMinimum);
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return Promise.resolve({ items: items.slice(0, filter.limit ?? 25), nextCursor: null });
  }

  save(product: Product): Promise<void> {
    // Igual que el adaptador real: al guardar se consumen los movimientos pendientes.
    product.pullStockMovements();
    this.store.set(product.id, product);
    return Promise.resolve();
  }

  async saveMany(products: readonly Product[]): Promise<void> {
    for (const product of products) await this.save(product);
  }
}

export class InMemoryDeliveryNoteRepository implements DeliveryNoteRepository {
  constructor(
    private readonly store: Map<string, DeliveryNote>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): DeliveryNote[] {
    return [...this.store.values()].filter((n) => n.tenantId === this.tenantId);
  }

  findById(id: DeliveryNoteId): Promise<DeliveryNote | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findByNumber(number: string): Promise<DeliveryNote | null> {
    return Promise.resolve(this.scoped().find((n) => n.number === number) ?? null);
  }

  list(filter: {
    status?: string;
    customerId?: string;
    limit?: number;
  }): Promise<Page<DeliveryNote>> {
    let items = this.scoped();
    if (filter.status) items = items.filter((n) => n.status === filter.status);
    if (filter.customerId) items = items.filter((n) => n.customerId === filter.customerId);

    items.sort((a, b) => b.number.localeCompare(a.number));
    return Promise.resolve({ items: items.slice(0, filter.limit ?? 25), nextCursor: null });
  }

  save(note: DeliveryNote): Promise<void> {
    this.store.set(note.id, note);
    return Promise.resolve();
  }
}

/**
 * Secuencias de numeracion.
 *
 * En memoria basta con incrementar, pero el adaptador de Postgres DEBE hacerlo con
 * SELECT ... FOR UPDATE: sin bloqueo, dos ventas simultaneas reciben el mismo numero,
 * y dos documentos con el mismo correlativo es un problema que solo se descubre al
 * cerrar el mes.
 */
export class InMemoryDocumentSequences implements DocumentSequences {
  constructor(
    private readonly counters: Map<string, number>,
    private readonly tenantId: TenantId,
  ) {}

  private static readonly PREFIXES: Readonly<Record<string, string>> = {
    delivery_note: 'NE',
    quote: 'PRE',
    purchase_order: 'OC',
    payment: 'REC',
    goods_receipt: 'RM',
  };

  next(docType: DocumentType): Promise<string> {
    const key = `${this.tenantId}:${docType}`;
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    const prefix = InMemoryDocumentSequences.PREFIXES[docType] ?? 'DOC';
    return Promise.resolve(`${prefix}-${next.toString().padStart(6, '0')}`);
  }
}

/** Saldo pendiente. Sin cobros implementados todavia, devuelve cero. */
export class InMemoryPaymentQueries implements PaymentQueries {
  outstandingBalanceFor(_customerId: CustomerId, currency: 'USD' | 'VES'): Promise<Money> {
    return Promise.resolve(Money.zero(currency));
  }
}

/** Almacenes que comparten todos los dobles en memoria de un mismo proceso. */
export interface SalesStores {
  readonly customers: Map<string, Customer>;
  readonly products: Map<string, Product>;
  readonly deliveryNotes: Map<string, DeliveryNote>;
  readonly usage: Map<string, number>;
  readonly sequences: Map<string, number>;
  // Administracion. Van en el MISMO conjunto de almacenes y no en otro aparte
  // porque el rollback de la unidad de trabajo los tiene que revertir igual:
  // invitar consume una plaza del plan, y si la escritura se deshace, la plaza
  // tiene que volver.
  // Un ARRAY y no un Map: la auditoria es un registro append-only y el orden
  // de llegada es parte del dato.
  readonly auditEntries: unknown[];
  readonly invitations: Map<string, unknown>;
  readonly members: Map<string, unknown>;
  readonly tenantSettings: Map<string, unknown>;
  readonly suppliers: Map<string, unknown>;
  readonly goodsReceipts: Map<string, unknown>;
}

export function createSalesStores(): SalesStores {
  return {
    customers: new Map(),
    products: new Map(),
    deliveryNotes: new Map(),
    usage: new Map(),
    sequences: new Map(),
    auditEntries: [],
    invitations: new Map(),
    members: new Map(),
    tenantSettings: new Map(),
    suppliers: new Map(),
    goodsReceipts: new Map(),
  };
}
