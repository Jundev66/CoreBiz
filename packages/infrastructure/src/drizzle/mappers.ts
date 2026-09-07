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
import type { schema } from '@corebiz/db';

/**
 * Traduccion entre filas de Postgres y agregados del dominio.
 *
 * Todo el conocimiento de "esta columna es aquel campo" vive aqui y en ningun
 * otro sitio. Los repositorios consultan y guardan; no saben de formatos.
 *
 * Las conversiones nunca son creativas: los value objects tienen una via de
 * reconstruccion explicita (`Money.fromMinor`, `Quantity.fromScaled`,
 * `ExchangeRate.fromScaled`) precisamente para esto. Reconstruir con la factoria
 * de validacion —`Money.of`, por ejemplo— seria revalidar datos que ya pasaron
 * por el dominio, y ademas convertiria un dato guardado en un `Result`.
 */

type CustomerRow = typeof schema.customers.$inferSelect;
type ProductRow = typeof schema.products.$inferSelect;
type DeliveryNoteRow = typeof schema.deliveryNotes.$inferSelect;
type DeliveryNoteLineRow = typeof schema.deliveryNoteLines.$inferSelect;

export type CustomerInsert = typeof schema.customers.$inferInsert;
export type ProductInsert = typeof schema.products.$inferInsert;
export type StockMovementInsert = typeof schema.stockMovements.$inferInsert;
export type DeliveryNoteInsert = typeof schema.deliveryNotes.$inferInsert;
export type DeliveryNoteLineInsert = typeof schema.deliveryNoteLines.$inferInsert;

/**
 * Importe y moneda viajan juntos o no viajan.
 *
 * La restriccion equivalente esta tambien en la base de datos. Que un `Money` a
 * medias sea imposible por partida doble no es redundancia: la columna protege
 * de un adaptador con un error, y esta funcion protege de una fila escrita antes
 * de que existiera la restriccion.
 */
function optionalMoney(minor: bigint | null, currency: string | null): Money | null {
  if (minor === null || currency === null) return null;
  return Money.fromMinor(minor, currency as Currency);
}

// ─── Customer ────────────────────────────────────────────────────────────────

export function toCustomer(row: CustomerRow): Customer {
  const props: CustomerProps = {
    tenantId: asId<TenantId>(row.tenantId),
    code: row.code,
    name: row.name,
    taxId: row.taxId,
    email: row.email,
    phone: row.phone,
    address: (row.address as CustomerAddress | null) ?? null,
    creditLimit: optionalMoney(row.creditLimitMinor, row.creditLimitCurrency),
    archivedAt: row.archivedAt,
  };
  return Customer.rehydrate(asId<CustomerId>(row.id), props);
}

export function fromCustomer(customer: Customer): CustomerInsert {
  const s = customer.snapshot();
  return {
    id: s.id,
    tenantId: s.tenantId,
    code: s.code,
    name: s.name,
    taxId: s.taxId,
    email: s.email,
    phone: s.phone,
    address: s.address,
    creditLimitMinor: s.creditLimit?.minorUnits ?? null,
    creditLimitCurrency: s.creditLimit?.currency ?? null,
    archivedAt: s.archivedAt,
  };
}

// ─── Product ─────────────────────────────────────────────────────────────────

export function toProduct(row: ProductRow): Product {
  const props: ProductProps = {
    tenantId: asId<TenantId>(row.tenantId),
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit,
    price: Money.fromMinor(row.priceMinor, row.priceCurrency as Currency),
    cost: optionalMoney(row.costMinor, row.costCurrency),
    taxable: row.taxable,
    trackStock: row.trackStock,
    // El saldo se LEE de la columna, no se reconstruye sumando el ledger. Ver el
    // comentario del esquema sobre por que el balance esta materializado.
    onHand: Quantity.fromScaled(row.onHand),
    minStock: row.minStock === null ? null : Quantity.fromScaled(row.minStock),
    stockPolicy: row.stockPolicy as StockPolicy,
    archivedAt: row.archivedAt,
  };
  return Product.rehydrate(asId<ProductId>(row.id), props);
}

export function fromProduct(product: Product): ProductInsert {
  const s = product.snapshot();
  return {
    id: s.id,
    tenantId: s.tenantId,
    sku: s.sku,
    name: s.name,
    description: s.description,
    unit: s.unit,
    priceMinor: s.price.minorUnits,
    priceCurrency: s.price.currency,
    costMinor: s.cost?.minorUnits ?? null,
    costCurrency: s.cost?.currency ?? null,
    taxable: s.taxable,
    trackStock: s.trackStock,
    onHand: s.onHand.scaledValue,
    minStock: s.minStock?.scaledValue ?? null,
    stockPolicy: s.stockPolicy,
    archivedAt: s.archivedAt,
  };
}

// ─── DeliveryNote ────────────────────────────────────────────────────────────

export function toDeliveryNote(
  row: DeliveryNoteRow,
  lineRows: readonly DeliveryNoteLineRow[],
): DeliveryNote {
  const currency = row.currency as Currency;
  const secondary = row.exchangeRateTo as Currency;

  const lines: DeliveryNoteLine[] = [...lineRows]
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((line) => ({
      lineNo: line.lineNo,
      productId: asId<ProductId>(line.productId),
      descriptionSnapshot: line.descriptionSnapshot,
      unitSnapshot: line.unitSnapshot,
      quantity: Quantity.fromScaled(line.quantity),
      unitPrice: Money.fromMinor(line.unitPriceMinor, currency),
      discountBp: line.discountBp,
      taxable: line.taxable,
      lineTotal: Money.fromMinor(line.lineTotalMinor, currency),
    }));

  const props: DeliveryNoteProps = {
    tenantId: asId<TenantId>(row.tenantId),
    number: row.number,
    customerId: asId<CustomerId>(row.customerId),
    quoteId: row.quoteId,
    status: row.status as DeliveryNoteStatus,
    currency,
    // La tasa se reconstruye con su fecha de captura, no con la de hoy: es lo
    // que hace que reimprimir una nota antigua no reescriba el historico.
    exchangeRate: ExchangeRate.fromScaled(
      row.exchangeRateScaled,
      row.exchangeRateFrom as Currency,
      secondary,
      row.exchangeRateAt,
    ),
    taxLabelSnapshot: row.taxLabelSnapshot,
    taxRateBpSnapshot: row.taxRateBpSnapshot,
    lines,
    // Los totales se leen tal cual. Recalcularlos aqui haria que un cambio de
    // precio de hoy alterase un documento emitido hace meses.
    totals: {
      subtotal: Money.fromMinor(row.subtotalMinor, currency),
      tax: Money.fromMinor(row.taxMinor, currency),
      total: Money.fromMinor(row.totalMinor, currency),
      totalInSecondaryCurrency: Money.fromMinor(row.totalSecondaryMinor, secondary),
    },
    issuedAt: row.issuedAt,
    issuedBy: row.issuedBy === null ? null : asId<UserId>(row.issuedBy),
    deliveredAt: row.deliveredAt,
    receivedBy: row.receivedBy,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    notes: row.notes,
  };

  return DeliveryNote.rehydrate(asId<DeliveryNoteId>(row.id), props);
}

export function fromDeliveryNote(note: DeliveryNote): DeliveryNoteInsert {
  const s = note.snapshot();
  return {
    id: s.id,
    tenantId: s.tenantId,
    number: s.number,
    customerId: s.customerId,
    quoteId: s.quoteId,
    status: s.status,
    currency: s.currency,
    exchangeRateScaled: s.exchangeRate.scaledRate,
    exchangeRateFrom: s.exchangeRate.from,
    exchangeRateTo: s.exchangeRate.to,
    exchangeRateAt: s.exchangeRate.capturedAt,
    taxLabelSnapshot: s.taxLabelSnapshot,
    taxRateBpSnapshot: s.taxRateBpSnapshot,
    subtotalMinor: s.totals.subtotal.minorUnits,
    taxMinor: s.totals.tax.minorUnits,
    totalMinor: s.totals.total.minorUnits,
    totalSecondaryMinor: s.totals.totalInSecondaryCurrency.minorUnits,
    issuedAt: s.issuedAt,
    issuedBy: s.issuedBy,
    deliveredAt: s.deliveredAt,
    receivedBy: s.receivedBy,
    voidedAt: s.voidedAt,
    voidReason: s.voidReason,
    notes: s.notes,
  };
}

export function fromDeliveryNoteLines(note: DeliveryNote): DeliveryNoteLineInsert[] {
  const s = note.snapshot();
  return s.lines.map((line) => ({
    tenantId: s.tenantId,
    deliveryNoteId: s.id,
    lineNo: line.lineNo,
    productId: line.productId,
    descriptionSnapshot: line.descriptionSnapshot,
    unitSnapshot: line.unitSnapshot,
    quantity: line.quantity.scaledValue,
    unitPriceMinor: line.unitPrice.minorUnits,
    discountBp: line.discountBp,
    taxable: line.taxable,
    lineTotalMinor: line.lineTotal.minorUnits,
  }));
}
