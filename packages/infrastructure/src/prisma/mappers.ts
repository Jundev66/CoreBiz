import {
  Customer,
  DeliveryNote,
  ExchangeRate,
  Money,
  Product,
  Quantity,
  asId,
  type Currency,
  type CustomerAddress,
  type CustomerId,
  type CustomerProps,
  type DeliveryNoteId,
  type DeliveryNoteLine,
  type DeliveryNoteProps,
  type DeliveryNoteStatus,
  type ProductId,
  type ProductProps,
  type StockPolicy,
  type TenantId,
  type UserId,
} from '@corebiz/domain';
import { Prisma } from '@corebiz/prisma-client';

/**
 * Traduccion entre filas de Postgres y agregados del dominio.
 *
 * Todo el conocimiento de "esta columna es aquel campo" vive aqui y en ningun otro sitio.
 * Los repositorios consultan y guardan; no saben de formatos.
 *
 * Las conversiones nunca son creativas: los value objects tienen una via de reconstruccion
 * explicita (`Money.fromMinor`, `Quantity.fromScaled`, `ExchangeRate.fromScaled`)
 * precisamente para esto. Reconstruir con la factoria de validacion —`Money.of`, por
 * ejemplo— seria revalidar datos que ya pasaron por el dominio, y ademas convertiria un
 * dato guardado en un `Result`.
 *
 * Los nombres son los de las columnas, en snake_case: el esquema se introspecciona de
 * Supabase, que es quien manda. Este fichero es justo la frontera donde ese vocabulario se
 * cambia por el del dominio.
 */

type CustomerRow = Prisma.customersGetPayload<object>;
type ProductRow = Prisma.productsGetPayload<object>;
type DeliveryNoteRow = Prisma.delivery_notesGetPayload<object>;
type DeliveryNoteLineRow = Prisma.delivery_note_linesGetPayload<object>;

export type CustomerInsert = Prisma.customersUncheckedCreateInput;
export type ProductInsert = Prisma.productsUncheckedCreateInput;
export type StockMovementInsert = Prisma.stock_movementsUncheckedCreateInput;
export type DeliveryNoteInsert = Prisma.delivery_notesUncheckedCreateInput;
export type DeliveryNoteLineInsert = Prisma.delivery_note_linesUncheckedCreateInput;

/**
 * Importe y moneda viajan juntos o no viajan.
 *
 * La restriccion equivalente esta tambien en la base de datos. Que un `Money` a medias sea
 * imposible por partida doble no es redundancia: la columna protege de un adaptador con un
 * error, y esta funcion protege de una fila escrita antes de que existiera la restriccion.
 */
function optionalMoney(minor: bigint | null, currency: string | null): Money | null {
  if (minor === null || currency === null) return null;
  return Money.fromMinor(minor, currency as Currency);
}

// ─── Customer ────────────────────────────────────────────────────────────────

export function toCustomer(row: CustomerRow): Customer {
  const props: CustomerProps = {
    tenantId: asId<TenantId>(row.tenant_id),
    code: row.code,
    name: row.name,
    taxId: row.tax_id,
    email: row.email,
    phone: row.phone,
    address: (row.address as CustomerAddress | null) ?? null,
    creditLimit: optionalMoney(row.credit_limit_minor, row.credit_limit_currency),
    archivedAt: row.archived_at,
  };
  return Customer.rehydrate(asId<CustomerId>(row.id), props);
}

export function fromCustomer(customer: Customer): CustomerInsert {
  const s = customer.snapshot();
  return {
    id: s.id,
    tenant_id: s.tenantId,
    code: s.code,
    name: s.name,
    tax_id: s.taxId,
    email: s.email,
    phone: s.phone,
    // `Prisma.DbNull` y no `null`: en una columna JSON, `null` a secas escribiria el
    // valor JSON `null`, que no es lo mismo que la ausencia de fila. `DbNull` escribe
    // NULL de SQL, que es lo que significaba antes.
    address: s.address === null ? Prisma.DbNull : (s.address as Prisma.InputJsonValue),
    credit_limit_minor: s.creditLimit?.minorUnits ?? null,
    credit_limit_currency: s.creditLimit?.currency ?? null,
    archived_at: s.archivedAt,
  };
}

// ─── Product ─────────────────────────────────────────────────────────────────

export function toProduct(row: ProductRow): Product {
  const props: ProductProps = {
    tenantId: asId<TenantId>(row.tenant_id),
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit,
    price: Money.fromMinor(row.price_minor, row.price_currency as Currency),
    cost: optionalMoney(row.cost_minor, row.cost_currency),
    taxable: row.taxable,
    trackStock: row.track_stock,
    // El saldo se LEE de la columna, no se reconstruye sumando el ledger. Ver el
    // comentario del esquema sobre por que el balance esta materializado.
    onHand: Quantity.fromScaled(row.on_hand),
    minStock: row.min_stock === null ? null : Quantity.fromScaled(row.min_stock),
    stockPolicy: row.stock_policy as StockPolicy,
    archivedAt: row.archived_at,
  };
  return Product.rehydrate(asId<ProductId>(row.id), props);
}

export function fromProduct(product: Product): ProductInsert {
  const s = product.snapshot();
  return {
    id: s.id,
    tenant_id: s.tenantId,
    sku: s.sku,
    name: s.name,
    description: s.description,
    unit: s.unit,
    price_minor: s.price.minorUnits,
    price_currency: s.price.currency,
    cost_minor: s.cost?.minorUnits ?? null,
    cost_currency: s.cost?.currency ?? null,
    taxable: s.taxable,
    track_stock: s.trackStock,
    on_hand: s.onHand.scaledValue,
    min_stock: s.minStock?.scaledValue ?? null,
    stock_policy: s.stockPolicy,
    archived_at: s.archivedAt,
  };
}

// ─── DeliveryNote ────────────────────────────────────────────────────────────

/**
 * Convierte el texto de una columna de estado en el estado del dominio.
 *
 * Una CONVERSION a secas —`row.status as DeliveryNoteStatus`— promete algo que no puede
 * cumplir: si la fila trae un valor que el dominio ya no conoce, el tipo dice que si y
 * el agregado sigue adelante con un estado imposible. El fallo aparece mucho despues y
 * en otro sitio.
 *
 * Aqui revienta donde se lee, diciendo la columna y el valor. Deberia ser inalcanzable
 * —la base lo restringe con un CHECK— y por eso mismo, si ocurre, hay que enterarse.
 */
export function estadoValido<T extends string>(
  valor: string,
  permitidos: readonly T[],
  columna: string,
): T {
  if ((permitidos as readonly string[]).includes(valor)) return valor as T;
  throw new Error(
    `${columna}: estado desconocido "${valor}" (se esperaba ${permitidos.join(', ')})`,
  );
}

export function toDeliveryNote(
  row: DeliveryNoteRow,
  lineRows: readonly DeliveryNoteLineRow[],
): DeliveryNote {
  const currency = row.currency as Currency;
  const secondary = row.exchange_rate_to as Currency;

  const lines: DeliveryNoteLine[] = [...lineRows]
    .sort((a, b) => a.line_no - b.line_no)
    .map((line) => ({
      lineNo: line.line_no,
      productId: asId<ProductId>(line.product_id),
      descriptionSnapshot: line.description_snapshot,
      unitSnapshot: line.unit_snapshot,
      quantity: Quantity.fromScaled(line.quantity),
      unitPrice: Money.fromMinor(line.unit_price_minor, currency),
      discountBp: line.discount_bp,
      taxable: line.taxable,
      lineTotal: Money.fromMinor(line.line_total_minor, currency),
    }));

  const props: DeliveryNoteProps = {
    tenantId: asId<TenantId>(row.tenant_id),
    number: row.number,
    customerId: asId<CustomerId>(row.customer_id),
    status: estadoValido<DeliveryNoteStatus>(
      row.status,
      ['issued', 'delivered', 'voided'],
      'delivery_notes.status',
    ),
    currency,
    // La tasa se reconstruye con su fecha de captura, no con la de hoy: es lo que hace que
    // reimprimir una nota antigua no reescriba el historico.
    exchangeRate: ExchangeRate.fromScaled(
      row.exchange_rate_scaled,
      row.exchange_rate_from as Currency,
      secondary,
      row.exchange_rate_at,
    ),
    taxLabelSnapshot: row.tax_label_snapshot,
    taxRateBpSnapshot: row.tax_rate_bp_snapshot,
    lines,
    // Los totales se leen tal cual. Recalcularlos aqui haria que un cambio de precio de
    // hoy alterase un documento emitido hace meses.
    totals: {
      subtotal: Money.fromMinor(row.subtotal_minor, currency),
      tax: Money.fromMinor(row.tax_minor, currency),
      total: Money.fromMinor(row.total_minor, currency),
      totalInSecondaryCurrency: Money.fromMinor(row.total_secondary_minor, secondary),
    },
    issuedAt: row.issued_at,
    issuedBy: row.issued_by === null ? null : asId<UserId>(row.issued_by),
    deliveredAt: row.delivered_at,
    receivedBy: row.received_by,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    notes: row.notes,
  };

  return DeliveryNote.rehydrate(asId<DeliveryNoteId>(row.id), props);
}

export function fromDeliveryNote(note: DeliveryNote): DeliveryNoteInsert {
  const s = note.snapshot();
  return {
    id: s.id,
    tenant_id: s.tenantId,
    number: s.number,
    customer_id: s.customerId,
    status: s.status,
    currency: s.currency,
    exchange_rate_scaled: s.exchangeRate.scaledRate,
    exchange_rate_from: s.exchangeRate.from,
    exchange_rate_to: s.exchangeRate.to,
    exchange_rate_at: s.exchangeRate.capturedAt,
    tax_label_snapshot: s.taxLabelSnapshot,
    tax_rate_bp_snapshot: s.taxRateBpSnapshot,
    subtotal_minor: s.totals.subtotal.minorUnits,
    tax_minor: s.totals.tax.minorUnits,
    total_minor: s.totals.total.minorUnits,
    total_secondary_minor: s.totals.totalInSecondaryCurrency.minorUnits,
    issued_at: s.issuedAt,
    issued_by: s.issuedBy,
    delivered_at: s.deliveredAt,
    received_by: s.receivedBy,
    voided_at: s.voidedAt,
    void_reason: s.voidReason,
    notes: s.notes,
  };
}

export function fromDeliveryNoteLines(note: DeliveryNote): DeliveryNoteLineInsert[] {
  const s = note.snapshot();
  return s.lines.map((line) => ({
    tenant_id: s.tenantId,
    delivery_note_id: s.id,
    line_no: line.lineNo,
    product_id: line.productId,
    description_snapshot: line.descriptionSnapshot,
    unit_snapshot: line.unitSnapshot,
    quantity: line.quantity.scaledValue,
    unit_price_minor: line.unitPrice.minorUnits,
    discount_bp: line.discountBp,
    taxable: line.taxable,
    line_total_minor: line.lineTotal.minorUnits,
  }));
}
