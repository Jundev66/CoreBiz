import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  bigint,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Catalogo e inventario.
 *
 * `products.on_hand` es el saldo materializado y `stock_movements` el libro
 * mayor. No es event sourcing puro y es deliberado: leer el stock de un producto
 * es leer una columna, no sumar su historia entera. El ledger es el registro
 * auditable; la columna es su proyeccion.
 *
 * Escalas fijadas por los value objects del dominio:
 *   Money    -> bigint de unidades menores, escala 2
 *   Quantity -> bigint escala 3
 */

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),

    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    unit: text('unit').notNull().default('und'),

    priceMinor: bigint('price_minor', { mode: 'bigint' }).notNull(),
    priceCurrency: text('price_currency').notNull(),
    costMinor: bigint('cost_minor', { mode: 'bigint' }),
    costCurrency: text('cost_currency'),

    taxable: boolean('taxable').notNull().default(true),
    /**
     * Un servicio no tiene existencias. Con esto en false el dominio ni descuenta
     * ni deja ajustar: no es que el saldo sea cero, es que no aplica.
     */
    trackStock: boolean('track_stock').notNull().default(true),
    onHand: bigint('on_hand', { mode: 'bigint' }).notNull().default(0n),
    minStock: bigint('min_stock', { mode: 'bigint' }),
    /** deny_negative | allow_negative — ver StockPolicy en el dominio. */
    stockPolicy: text('stock_policy').notNull().default('deny_negative'),

    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('products_tenant_sku_key').on(t.tenantId, t.sku),
    index('products_tenant_name_idx')
      .on(t.tenantId, t.name)
      .where(sql`${t.archivedAt} is null`),
    // Indice parcial para la alerta de reposicion: solo entran las filas que
    // pueden estar bajo minimo, que son una fraccion del catalogo.
    index('products_below_minimum_idx')
      .on(t.tenantId, t.onHand)
      .where(sql`${t.trackStock} and ${t.minStock} is not null and ${t.archivedAt} is null`),
  ],
);

/**
 * Libro mayor de inventario.
 *
 * Cada fila es un hecho ocurrido: no se edita ni se borra. Una salida se anula
 * con un movimiento de compensacion que la contrarresta, nunca borrando la
 * original. Por eso no tiene `updated_at`: un hecho no se actualiza.
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),

    /** in | out | adjust | void_compensation */
    kind: text('kind').notNull(),
    /** Delta CON SIGNO en escala 3: una salida guarda la cantidad en negativo. */
    quantity: bigint('quantity', { mode: 'bigint' }).notNull(),
    /**
     * Saldo resultante, calculado por el dominio. Guardarlo permite auditar el
     * inventario en cualquier momento del pasado sin reproducir toda la cadena.
     */
    balanceAfter: bigint('balance_after', { mode: 'bigint' }).notNull(),

    /**
     * Referencia al documento que lo origino. Es texto y no uuid porque el
     * dominio lo declara como string, y la base de datos no debe ser mas
     * estricta que el tipo que almacena.
     */
    refType: text('ref_type'),
    refId: text('ref_id'),
    note: text('note'),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_movements_product_time_idx').on(t.tenantId, t.productId, t.occurredAt.desc()),
    index('stock_movements_ref_idx').on(t.tenantId, t.refType, t.refId),
  ],
);
