import type { Page } from '../ports/page';

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
  readonly archived: boolean;
}

/**
 * La ficha completa. Lo que el listado no muestra porque no cabe.
 *
 * No lleva fecha de alta, y no es un olvido: el dominio no la guarda. Se le pasa al
 * crear y se descarta. Anadirla aqui obligaria a leerla de una columna que solo
 * existe en Postgres, y la ficha ensenaria una cosa contra la base de datos y otra
 * en memoria — que es justo la grieta por la que los dos adaptadores dejan de ser
 * intercambiables.
 */
export interface CustomerDetail extends CustomerListItem {
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
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
  /** Null si no existe O si es de otro tenant: desde fuera no se distingue, a proposito. */
  byId(id: string): Promise<CustomerDetail | null>;
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
  readonly archived: boolean;
}

export interface ProductDetail extends ProductListItem {
  readonly cost: string | null;
  readonly minStock: string | null;
  readonly taxable: boolean;
}

/**
 * Una linea del libro de movimientos.
 *
 * `balance` es el saldo DESPUES del movimiento, tal y como se guardo. No se
 * recalcula al leer: el sentido de un libro de movimientos es poder explicar como
 * se llego al saldo de hoy, y recalcularlo desde el final destruiria justamente la
 * prueba de que cuadra.
 */
export interface StockMovementItem {
  readonly at: Date;
  readonly kind: string;
  readonly quantity: string;
  readonly balance: string;
  readonly reason: string | null;
  readonly reference: string | null;
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
  list(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<Page<ProductListItem>>;
  options(limit?: number): Promise<readonly ProductOption[]>;
  byId(id: string): Promise<ProductDetail | null>;
  /** Los ultimos movimientos del producto, del mas reciente al mas antiguo. */
  movements(productId: string, limit?: number): Promise<readonly StockMovementItem[]>;
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
  /** Cuando se confirmo la entrega, y quien firmo el recibo. Nulos hasta que ocurre. */
  readonly deliveredAt: Date | null;
  readonly receivedBy: string | null;
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

// ─── Compras ─────────────────────────────────────────────────────────────────

export interface SupplierListItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly archived: boolean;
}

export interface SupplierOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface GoodsReceiptListItem {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly supplierName: string;
  readonly total: string;
  readonly lineCount: number;
  readonly receivedAt: Date | null;
}

/**
 * Una linea de una recepcion.
 *
 * La descripcion y la unidad van CONGELADAS, igual que en una nota de entrega: el
 * papel tiene que decir lo que llego aquel dia, no lo que el producto se llame hoy.
 * Si manana se renombra "Harina 1 kg" a "Harina de trigo 1 kg", la recepcion de
 * marzo sigue explicando lo que se recibio en marzo.
 */
export interface GoodsReceiptLineView {
  readonly lineNo: number;
  readonly description: string;
  readonly unit: string;
  readonly quantity: string;
  readonly unitCost: string;
  readonly lineTotal: string;
}

export interface GoodsReceiptView extends GoodsReceiptListItem {
  readonly supplierCode: string;
  readonly supplierReference: string | null;
  readonly notes: string | null;
  readonly voidReason: string | null;
  readonly lines: readonly GoodsReceiptLineView[];
}

export interface PurchasingQueries {
  suppliers(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<Page<SupplierListItem>>;
  supplierOptions(limit?: number): Promise<readonly SupplierOption[]>;
  receipts(filter: { limit?: number }): Promise<Page<GoodsReceiptListItem>>;
  /** Null si no existe o si es de otro tenant: desde fuera no se distingue. */
  receiptById(id: string): Promise<GoodsReceiptView | null>;
}

/** Todo el lado de lectura disponible para un request. */
export interface ReadModels {
  readonly customers: CustomerQueries;
  readonly products: ProductQueries;
  readonly deliveryNotes: DeliveryNoteQueries;
  readonly usage: UsageQueries;
  readonly reports: ReportQueries;
  readonly admin: AdminQueries;
  readonly purchasing: PurchasingQueries;
}
