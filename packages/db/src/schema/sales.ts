import {
  pgTable,
  uuid,
  text,
  bigint,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

/**
 * Notas de entrega.
 *
 * CoreBiz emite NOTAS DE ENTREGA: documentos internos sin valor fiscal. No hay
 * numeracion de control ni tributo declarado. Ver docs/adr/003-notas-de-entrega.md.
 *
 * La tasa de cambio y el impuesto quedan congelados en el documento. Reimprimir
 * una nota de marzo con la tasa de septiembre reescribiria el historico contable
 * del negocio cada vez que alguien la abre.
 */

export const deliveryNotes = pgTable(
  'delivery_notes',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),

    /** Correlativo interno del tenant. Sin valor fiscal. */
    number: text('number').notNull(),
    customerId: uuid('customer_id').notNull(),
    quoteId: uuid('quote_id'),

    /** draft | issued | delivered | voided */
    status: text('status').notNull(),
    currency: text('currency').notNull(),

    /** Tasa escalada x10^8 — ver ExchangeRate en el dominio. */
    exchangeRateScaled: bigint('exchange_rate_scaled', { mode: 'bigint' }).notNull(),
    exchangeRateFrom: text('exchange_rate_from').notNull(),
    exchangeRateTo: text('exchange_rate_to').notNull(),
    /**
     * Cuando se capturo la tasa. Sin esta fecha el dato invita a leerse como la
     * tasa de hoy, que es justo lo que no es.
     */
    exchangeRateAt: timestamp('exchange_rate_at', { withTimezone: true }).notNull(),

    taxLabelSnapshot: text('tax_label_snapshot').notNull(),
    taxRateBpSnapshot: integer('tax_rate_bp_snapshot').notNull(),

    /**
     * Totales congelados. NO se recalculan al leer: el documento dice lo que dijo
     * el dia que se emitio, aunque hoy el precio del producto sea otro.
     */
    subtotalMinor: bigint('subtotal_minor', { mode: 'bigint' }).notNull(),
    taxMinor: bigint('tax_minor', { mode: 'bigint' }).notNull(),
    totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
    /** Expresado en `exchange_rate_to`, no en `currency`. */
    totalSecondaryMinor: bigint('total_secondary_minor', { mode: 'bigint' }).notNull(),

    issuedAt: timestamp('issued_at', { withTimezone: true }),
    issuedBy: uuid('issued_by'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    receivedBy: text('received_by'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('delivery_notes_tenant_number_key').on(t.tenantId, t.number),
    index('delivery_notes_tenant_issued_idx').on(t.tenantId, t.issuedAt.desc()),
    index('delivery_notes_tenant_customer_idx').on(t.tenantId, t.customerId),
  ],
);

/**
 * Lineas de la nota.
 *
 * Congelan el nombre y la unidad del producto tal como estaban al emitir. Si
 * manana el producto se renombra, la nota sigue diciendo lo que se entrego, que
 * es el unico dato que le sirve a quien la recibio.
 *
 * No guardan moneda: es la de la nota. Repetirla por linea seria una via para
 * que un documento acabe con dos monedas distintas dentro.
 */
export const deliveryNoteLines = pgTable(
  'delivery_note_lines',
  {
    tenantId: uuid('tenant_id').notNull(),
    deliveryNoteId: uuid('delivery_note_id').notNull(),
    /** Identidad de la linea dentro del documento; no hace falta un uuid propio. */
    lineNo: integer('line_no').notNull(),

    productId: uuid('product_id').notNull(),
    descriptionSnapshot: text('description_snapshot').notNull(),
    unitSnapshot: text('unit_snapshot').notNull(),

    quantity: bigint('quantity', { mode: 'bigint' }).notNull(),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'bigint' }).notNull(),
    /** Descuento en puntos basicos: 1500 = 15,00 %. */
    discountBp: integer('discount_bp').notNull().default(0),
    taxable: boolean('taxable').notNull().default(true),
    /**
     * Redondeado UNA sola vez, por el dominio. Recalcularlo al leer produciria
     * diferencias de centimos entre lo que dice la nota y lo que dice la pantalla.
     */
    lineTotalMinor: bigint('line_total_minor', { mode: 'bigint' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deliveryNoteId, t.lineNo] }),
    // Sostiene el informe de productos mas vendidos.
    index('delivery_note_lines_product_idx').on(t.tenantId, t.productId),
  ],
);
