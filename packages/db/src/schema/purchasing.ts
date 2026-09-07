import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Compras: proveedores y recepcion de mercancia.
 *
 * Espejo tipado de supabase/migrations/20260907160000_purchasing.sql. El SQL
 * manda; esto es el acceso tipado.
 */

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),

    code: text('code').notNull(),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    contactName: text('contact_name'),
    notes: text('notes'),

    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('suppliers_tenant_code_key').on(t.tenantId, t.code),
    index('suppliers_tenant_name_idx').on(t.tenantId, t.name),
  ],
);

export const goodsReceipts = pgTable(
  'goods_receipts',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),

    number: text('number').notNull(),
    supplierId: uuid('supplier_id').notNull(),
    purchaseOrderId: uuid('purchase_order_id'),

    status: text('status').notNull(),
    currency: text('currency').notNull(),
    totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),

    supplierReference: text('supplier_reference'),
    notes: text('notes'),

    receivedAt: timestamp('received_at', { withTimezone: true }),
    receivedBy: uuid('received_by'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('goods_receipts_tenant_number_key').on(t.tenantId, t.number),
    index('goods_receipts_tenant_received_idx').on(t.tenantId, t.receivedAt),
  ],
);

export const goodsReceiptLines = pgTable(
  'goods_receipt_lines',
  {
    tenantId: uuid('tenant_id').notNull(),
    goodsReceiptId: uuid('goods_receipt_id').notNull(),
    lineNo: integer('line_no').notNull(),

    productId: uuid('product_id').notNull(),
    descriptionSnapshot: text('description_snapshot').notNull(),
    unitSnapshot: text('unit_snapshot').notNull(),

    quantity: bigint('quantity', { mode: 'bigint' }).notNull(),
    unitCostMinor: bigint('unit_cost_minor', { mode: 'bigint' }).notNull(),
    lineTotalMinor: bigint('line_total_minor', { mode: 'bigint' }).notNull(),
  },
  (t) => [index('goods_receipt_lines_product_idx').on(t.tenantId, t.productId)],
);
