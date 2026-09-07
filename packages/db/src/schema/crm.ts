import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  bigint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Clientes.
 *
 * Espejo tipado de supabase/migrations/20260906110100_business_tables.sql. El SQL
 * es la fuente de verdad —lleva las politicas RLS, los triggers y las
 * restricciones que Drizzle no expresa bien—; esto es la via de acceso tipada.
 * Un test de integracion compara ambos para que no puedan divergir.
 */

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),

    /** Ya normalizado por el dominio: mayusculas y sin espacios sobrantes. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    /** CustomerAddress: campos opcionales que no justifican una tabla propia. */
    address: jsonb('address'),

    /** Money se parte en importe y moneda; nunca existe uno sin el otro. */
    creditLimitMinor: bigint('credit_limit_minor', { mode: 'bigint' }),
    creditLimitCurrency: text('credit_limit_currency'),

    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unico DENTRO del tenant: dos empresas pueden tener cada una su CLI-001.
    uniqueIndex('customers_tenant_code_key').on(t.tenantId, t.code),
    index('customers_tenant_name_idx')
      .on(t.tenantId, t.name)
      .where(sql`${t.archivedAt} is null`),
  ],
);
