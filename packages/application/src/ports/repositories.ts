import type { Customer, CustomerId, Plan, Role, TenantId, UserId } from '@corebiz/domain';

/**
 * Puertos de persistencia.
 *
 * Nota deliberada: NINGUNA firma recibe `tenantId`. El contexto de tenant se inyecta al
 * construir el Unit of Work, de modo que un caso de uso no puede olvidarlo ni elegir
 * uno distinto — no llega siquiera a tener la oportunidad. Ver ADR 005.
 */

export interface Page<T> {
  readonly items: readonly T[];
  /** Cursor de la siguiente pagina, o null si no hay mas. Paginacion por keyset. */
  readonly nextCursor: string | null;
}

export interface ListCustomersFilter {
  readonly search?: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>;
  findByCode(code: string): Promise<Customer | null>;
  list(filter: ListCustomersFilter): Promise<Page<Customer>>;
  save(customer: Customer): Promise<void>;
  /** Borrado fisico. Solo se permite si el cliente no tiene documentos asociados. */
  delete(id: CustomerId): Promise<void>;
  hasDocuments(id: CustomerId): Promise<boolean>;
}

/**
 * Contador de uso por recurso.
 *
 * Existe para que comprobar una cuota sea una lectura por clave primaria en lugar de un
 * `COUNT(*)` sobre una tabla que crece. En un ERP se escribe constantemente; contar
 * filas en cada escritura degrada el sistema justo cuando mas se usa.
 */
export interface UsageCounter {
  current(resource: string): Promise<number>;
  increment(resource: string, amount?: number): Promise<void>;
  decrement(resource: string, amount?: number): Promise<void>;
}

export interface AuditEntry {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly summary?: Readonly<Record<string, unknown>>;
  readonly diff?: Readonly<Record<string, unknown>>;
}

/** Registro de auditoria. Solo escribe: no expone borrado ni actualizacion por diseno. */
export interface AuditLogger {
  record(entry: AuditEntry): Promise<void>;
}

/** Ajustes del tenant que necesita el dominio para decidir. */
export interface TenantSettings {
  readonly taxLabel: string;
  readonly taxRateBp: number;
  readonly baseCurrency: 'USD' | 'VES';
  readonly exchangeRateScaled: bigint | null;
  readonly exchangeRateAt: Date | null;
}

/**
 * Todo lo que un caso de uso sabe sobre quien actua y donde.
 *
 * Se construye una vez por request, a partir de una sesion ya verificada.
 */
export interface TenantContext {
  readonly tenantId: TenantId;
  readonly tenantSlug: string;
  readonly actor: { readonly userId: UserId; readonly role: Role };
  readonly plan: Plan;
  readonly settings: TenantSettings;
  readonly isDemo: boolean;
}

/** Repositorios disponibles dentro de una unidad de trabajo. */
export interface Repositories {
  readonly customers: CustomerRepository;
  readonly usage: UsageCounter;
  readonly audit: AuditLogger;
}

/**
 * Unidad de trabajo: una transaccion real de base de datos.
 *
 * Emitir una nota de entrega toca siete tablas. O ocurre todo, o no ocurre nada: un
 * fallo a mitad deja el inventario descuadrado, y un inventario descuadrado es un ERP
 * en el que ya nadie confia.
 *
 * La implementacion sobre Postgres fija ademas las variables de sesion que leen las
 * politicas RLS, siempre con alcance LOCAL a la transaccion. Ver ADR 005.
 */
export interface UnitOfWork {
  run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}
