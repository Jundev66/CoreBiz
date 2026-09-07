import type { Page } from '../ports/repositories';

/**
 * Lado de LECTURA (CQRS ligero).
 *
 * Los puertos de escritura devuelven agregados porque quien escribe necesita las
 * invariantes. Quien lee, no: pintar una tabla de veinticinco notas no necesita
 * cinco agregados con sus lineas, sus totales y sus tasas reconstruidos — necesita
 * veinticinco filas de texto. Reutilizar los repositorios para leer obliga a
 * reconstruir el mundo entero para mostrar un numero.
 *
 * Por eso estos modelos son PLANOS: cadenas, numeros y fechas. Ademas de ser mas
 * baratos, sobreviven al paso de servidor a navegador, cosa que un value object
 * no hace.
 *
 * Las cantidades monetarias viajan como cadena decimal canonica ("1234.56"). No
 * como numero: un float perderia centimos, y ese es exactamente el error que el
 * dominio evita usando enteros.
 */

// ─── Clientes ────────────────────────────────────────────────────────────────

export interface CustomerListItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly creditLimit: string | null;
}

/** Lo justo para un desplegable: identificador y como se muestra. */
export interface CustomerOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface CustomerQueries {
  list(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<Page<CustomerListItem>>;
  options(limit?: number): Promise<readonly CustomerOption[]>;
}

// ─── Catalogo ────────────────────────────────────────────────────────────────

export interface ProductListItem {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly unit: string;
  readonly price: string;
  readonly trackStock: boolean;
  /** Saldo actual, o null si el producto no lleva inventario (un servicio). */
  readonly onHand: string | null;
  readonly belowMinimum: boolean;
}

export interface ProductOption {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly price: string;
  readonly unit: string;
  readonly stock: string | null;
}

export interface ProductQueries {
  list(filter: { search?: string; limit?: number }): Promise<Page<ProductListItem>>;
  options(limit?: number): Promise<readonly ProductOption[]>;
}

// ─── Notas de entrega ────────────────────────────────────────────────────────

export interface DeliveryNoteListItem {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly customerName: string;
  readonly total: string;
  /** El mismo total con la tasa CONGELADA del documento, no con la de hoy. */
  readonly totalSecondary: string;
  readonly issuedAt: Date | null;
}

export interface DeliveryNoteLineView {
  readonly lineNo: number;
  readonly description: string;
  readonly unit: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discountBp: number;
  readonly lineTotal: string;
}

export interface DeliveryNoteView {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly customerName: string;
  readonly issuedAt: Date | null;
  /** Tasa congelada al emitir, con la fecha en que se capturo. */
  readonly exchangeRate: string;
  readonly exchangeRateAt: Date;
  readonly taxLabel: string;
  readonly voidReason: string | null;
  readonly lines: readonly DeliveryNoteLineView[];
  readonly subtotal: string;
  readonly tax: string;
  readonly total: string;
  readonly totalSecondary: string;
}

export interface DeliveryNoteQueries {
  list(filter: { status?: string; limit?: number }): Promise<Page<DeliveryNoteListItem>>;
  findById(id: string): Promise<DeliveryNoteView | null>;
}

// ─── Consumo y reportes ──────────────────────────────────────────────────────

export interface UsageQueries {
  current(resource: string): Promise<number>;
}

export interface BestSeller {
  readonly name: string;
  readonly units: number;
  readonly revenue: string;
}

export interface SalesReport {
  readonly currency: string;
  readonly salesTotal: string;
  readonly averageTicket: string;
  readonly inventoryValue: string;
  readonly documentCount: number;
  readonly bestSellers: readonly BestSeller[];
}

/**
 * Resumen de ventas e inventario.
 *
 * Es una sola llamada y no cuatro a proposito: contra Postgres se resuelve con
 * agregados que la base de datos calcula sin traer las filas, y devolver un solo
 * objeto evita que la pantalla haga cuatro viajes para pintar cuatro cifras que
 * ademas tienen que ser coherentes entre si.
 */
export interface ReportQueries {
  salesSummary(): Promise<SalesReport>;
}

// ─── Administracion ──────────────────────────────────────────────────────────

export interface TeamMemberView {
  readonly userId: string;
  readonly email: string | null;
  readonly role: string;
  readonly joinedAt: Date;
  /** Marca a quien esta mirando la pantalla, para no ofrecerle expulsarse. */
  readonly isYou: boolean;
}

export interface PendingInvitationView {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly expiresAt: Date;
}

/**
 * Una entrada del registro de auditoria, ya lista para pintar.
 *
 * `summary` viaja como objeto plano y NO como texto ya redactado: quien lo pinta
 * decide el idioma. Es la misma razon por la que los errores del dominio viajan
 * como codigos.
 */
export interface AuditEntryView {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorEmail: string | null;
  readonly action: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly summary: Readonly<Record<string, unknown>> | null;
}

export interface AuditFilter {
  readonly action?: string;
  readonly actorEmail?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface AdminQueries {
  team(): Promise<readonly TeamMemberView[]>;
  pendingInvitations(): Promise<readonly PendingInvitationView[]>;
  /**
   * El registro de auditoria, del mas reciente al mas antiguo.
   *
   * Lo protege la politica RLS —solo owner y admin— y no un `if` de la pantalla.
   * Que la auditoria diga quien hizo que la convierte en un panel de vigilancia
   * entre companeros si la lee cualquiera con permiso de escritura.
   */
  auditLog(filter: AuditFilter): Promise<Page<AuditEntryView>>;
  /** Acciones distintas presentes en el registro, para poblar el filtro. */
  auditActions(): Promise<readonly string[]>;
}

/** Todo el lado de lectura disponible para un request. */
export interface ReadModels {
  readonly customers: CustomerQueries;
  readonly products: ProductQueries;
  readonly deliveryNotes: DeliveryNoteQueries;
  readonly usage: UsageQueries;
  readonly reports: ReportQueries;
  readonly admin: AdminQueries;
}
