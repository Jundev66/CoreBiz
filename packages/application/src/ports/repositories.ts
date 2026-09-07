import type { Page } from './page';
import type { GoodsReceiptRepository, SupplierRepository } from './purchasing';
import type {
  InvitationRepository,
  MembershipRepository,
  TenantSettingsRepository,
} from './administration';
import type {
  Customer,
  CustomerId,
  DeliveryNote,
  DeliveryNoteId,
  Money,
  Plan,
  Product,
  ProductId,
  Role,
  TenantId,
  UserId,
} from '@corebiz/domain';

/**
 * Puertos de persistencia.
 *
 * Nota deliberada: NINGUNA firma recibe `tenantId`. El contexto de tenant se inyecta al
 * construir el Unit of Work, de modo que un caso de uso no puede olvidarlo ni elegir
 * uno distinto — no llega siquiera a tener la oportunidad. Ver ADR 005.
 */

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
  readonly products: ProductRepository;
  readonly deliveryNotes: DeliveryNoteRepository;
  readonly sequences: DocumentSequences;
  readonly payments: PaymentQueries;
  readonly usage: UsageCounter;
  readonly audit: AuditLogger;

  // Administracion. Estan en la MISMA unidad de trabajo que el resto por una
  // razon concreta: invitar consume una plaza del plan y escribe auditoria, y
  // esas tres escrituras tienen que ocurrir juntas o no ocurrir. Con un
  // contenedor aparte, una invitacion podria quedar creada sin haber descontado
  // la plaza, y el limite del plan dejaria de significar nada.
  readonly invitations: InvitationRepository;
  readonly members: MembershipRepository;
  readonly settings: TenantSettingsRepository;

  // Compras. Entran en la misma unidad de trabajo que productos y movimientos
  // porque recibir mercancia toca las tres cosas a la vez: el documento, el
  // saldo de cada producto y el libro mayor de inventario.
  readonly suppliers: SupplierRepository;
  readonly goodsReceipts: GoodsReceiptRepository;
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

export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  findManyByIds(ids: readonly ProductId[]): Promise<Product[]>;
  list(filter: { search?: string; belowMinimum?: boolean; limit?: number }): Promise<Page<Product>>;
  save(product: Product): Promise<void>;
  /** Guarda varios en una pasada, con sus movimientos de stock pendientes. */
  saveMany(products: readonly Product[]): Promise<void>;
}

export interface DeliveryNoteRepository {
  findById(id: DeliveryNoteId): Promise<DeliveryNote | null>;
  findByNumber(number: string): Promise<DeliveryNote | null>;
  list(filter: {
    status?: string;
    customerId?: string;
    limit?: number;
  }): Promise<Page<DeliveryNote>>;
  save(note: DeliveryNote): Promise<void>;
}

/**
 * Secuencias de numeracion por tipo de documento.
 *
 * `next()` DEBE consumir el correlativo con bloqueo dentro de la transaccion en curso
 * (SELECT ... FOR UPDATE). Sin ese bloqueo, dos ventas simultaneas obtienen el mismo
 * numero, y dos documentos con el mismo correlativo es un problema que solo se descubre
 * al cerrar el mes.
 */
export type DocumentType =
  'delivery_note' | 'quote' | 'purchase_order' | 'payment' | 'goods_receipt';

export interface DocumentSequences {
  next(docType: DocumentType): Promise<string>;
}

export interface PaymentQueries {
  /** Saldo pendiente del cliente. Vive fuera del agregado Customer a proposito. */
  outstandingBalanceFor(customerId: CustomerId, currency: 'USD' | 'VES'): Promise<Money>;
}

// Se reexporta para no romper los import existentes; la definicion vive en
// `page.ts` para evitar un ciclo con los puertos de compras.
export type { Page };
