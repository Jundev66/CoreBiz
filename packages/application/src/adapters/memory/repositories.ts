import {
  Plan,
  type Customer,
  type CustomerId,
  type TenantId,
  type UserId,
  asId,
} from '@corebiz/domain';
import {
  InMemoryProductRepository,
  InMemoryDeliveryNoteRepository,
  InMemoryDocumentSequences,
  InMemoryPaymentQueries,
  createSalesStores,
  type SalesStores,
} from './sales';
import type {
  AuditEntry,
  AuditLogger,
  CustomerRepository,
  ListCustomersFilter,
  Page,
  Repositories,
  TenantContext,
  UnitOfWork,
  UsageCounter,
} from '../../ports/index';

/**
 * Adaptadores en memoria.
 *
 * Cumplen dos funciones a la vez, y por eso viven aqui y no en los tests:
 *
 *   1. Permiten testear casos de uso sin base de datos, en milisegundos.
 *   2. Alimentan `pnpm dev:nodb`, que arranca la aplicacion COMPLETA sin Postgres ni
 *      Docker. Si la arquitectura hexagonal fuese decorativa, eso no seria posible.
 *
 * Imitan el comportamiento del adaptador real en lo que importa: el filtrado por tenant
 * ocurre aqui tambien, para que un test que pase en memoria no oculte una fuga.
 */

export class InMemoryCustomerRepository implements CustomerRepository {
  constructor(
    private readonly store: Map<string, Customer>,
    private readonly tenantId: TenantId,
  ) {}

  /** Igual que el repositorio real: filtra por tenant SIEMPRE, sin excepcion. */
  private scoped(): Customer[] {
    return [...this.store.values()].filter((c) => c.tenantId === this.tenantId);
  }

  findById(id: CustomerId): Promise<Customer | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findByCode(code: string): Promise<Customer | null> {
    const normalized = code.trim().toUpperCase();
    return Promise.resolve(this.scoped().find((c) => c.code === normalized) ?? null);
  }

  list(filter: ListCustomersFilter): Promise<Page<Customer>> {
    let items = this.scoped();

    if (!filter.includeArchived) {
      items = items.filter((c) => !c.isArchived);
    }
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.code.toLowerCase().includes(needle) ||
          (c.taxId?.toLowerCase().includes(needle) ?? false),
      );
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const limit = filter.limit ?? 25;
    const start = filter.cursor ? Number(filter.cursor) : 0;
    const slice = items.slice(start, start + limit);
    const nextCursor = start + limit < items.length ? String(start + limit) : null;

    return Promise.resolve({ items: slice, nextCursor });
  }

  save(customer: Customer): Promise<void> {
    this.store.set(customer.id, customer);
    return Promise.resolve();
  }

  delete(id: CustomerId): Promise<void> {
    const found = this.store.get(id);
    if (found && found.tenantId === this.tenantId) this.store.delete(id);
    return Promise.resolve();
  }

  hasDocuments(_id: CustomerId): Promise<boolean> {
    return Promise.resolve(false);
  }
}

export class InMemoryUsageCounter implements UsageCounter {
  constructor(
    private readonly store: Map<string, number>,
    private readonly tenantId: TenantId,
  ) {}

  private key(resource: string): string {
    return `${this.tenantId}:${resource}`;
  }

  current(resource: string): Promise<number> {
    return Promise.resolve(this.store.get(this.key(resource)) ?? 0);
  }

  increment(resource: string, amount = 1): Promise<void> {
    this.store.set(this.key(resource), (this.store.get(this.key(resource)) ?? 0) + amount);
    return Promise.resolve();
  }

  decrement(resource: string, amount = 1): Promise<void> {
    const next = (this.store.get(this.key(resource)) ?? 0) - amount;
    this.store.set(this.key(resource), Math.max(0, next));
    return Promise.resolve();
  }
}

export class InMemoryAuditLogger implements AuditLogger {
  readonly entries: (AuditEntry & { tenantId: TenantId })[] = [];

  constructor(private readonly tenantId: TenantId) {}

  record(entry: AuditEntry): Promise<void> {
    this.entries.push({ ...entry, tenantId: this.tenantId });
    return Promise.resolve();
  }
}

/**
 * Unidad de trabajo en memoria con rollback real.
 *
 * Un doble de test que siempre "confirma" ocultaria justo los bugs que la transaccion
 * existe para evitar. Este toma una instantanea de TODOS los almacenes antes de
 * ejecutar y la restaura si algo lanza, de modo que un test puede comprobar que un
 * fallo a mitad no deja el inventario descuadrado ni numeracion consumida.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  private readonly stores: SalesStores;

  constructor(
    customersOrStores: Map<string, Customer> | SalesStores,
    private readonly usageMap: Map<string, number> = new Map(),
    private readonly tenantId: TenantId = asId<TenantId>('tenant-test'),
    readonly audit = new InMemoryAuditLogger(tenantId),
  ) {
    this.stores =
      customersOrStores instanceof Map
        ? { ...createSalesStores(), customers: customersOrStores, usage: usageMap }
        : customersOrStores;
  }

  async run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    const snapshots = {
      customers: new Map(this.stores.customers),
      products: new Map(this.stores.products),
      deliveryNotes: new Map(this.stores.deliveryNotes),
      usage: new Map(this.stores.usage),
      sequences: new Map(this.stores.sequences),
    };
    const auditLength = this.audit.entries.length;

    try {
      return await fn({
        customers: new InMemoryCustomerRepository(this.stores.customers, this.tenantId),
        products: new InMemoryProductRepository(this.stores.products, this.tenantId),
        deliveryNotes: new InMemoryDeliveryNoteRepository(this.stores.deliveryNotes, this.tenantId),
        sequences: new InMemoryDocumentSequences(this.stores.sequences, this.tenantId),
        payments: new InMemoryPaymentQueries(),
        usage: new InMemoryUsageCounter(this.stores.usage, this.tenantId),
        audit: this.audit,
      });
    } catch (error) {
      // Rollback: se restaura cada almacen a su estado previo.
      for (const key of Object.keys(snapshots) as (keyof typeof snapshots)[]) {
        const target = this.stores[key] as Map<string, unknown>;
        target.clear();
        (snapshots[key] as Map<string, unknown>).forEach((v, k) => target.set(k, v));
      }
      this.audit.entries.length = auditLength;
      throw error;
    }
  }
}

/** Contexto de tenant listo para usar en tests, con valores por defecto razonables. */
export function makeTestContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: asId<TenantId>('tenant-test'),
    tenantSlug: 'comercial-demo',
    actor: { userId: asId<UserId>('user-test'), role: 'owner' },
    plan: Plan.of('free'),
    settings: {
      taxLabel: 'Impuesto informativo',
      taxRateBp: 1600,
      baseCurrency: 'USD',
      exchangeRateScaled: 3_650_000_000n,
      exchangeRateAt: new Date('2026-09-06T00:00:00.000Z'),
    },
    isDemo: false,
    ...overrides,
  };
}
