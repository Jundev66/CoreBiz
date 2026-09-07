import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  bigint,
  integer,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Tablas de tenancy: quien es cada empresa, quien pertenece a ella y con que limites.
 *
 * Convenciones de todo el esquema:
 *   - PK `uuid` v7, generada en la aplicacion. Los v7 llevan la marca temporal en los
 *     bits altos, asi que son ordenables por fecha y mantienen sanos los indices B-tree.
 *     Con v4 cada insercion cae en una pagina aleatoria y el rendimiento se degrada.
 *   - Dinero en `bigint` de unidades menores. Nunca float, nunca numeric.
 *   - Todo indice compuesto empieza por `tenant_id`: es la columna por la que filtra
 *     absolutamente cada consulta del sistema.
 */

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),

    planCode: text('plan_code').notNull().default('free'),
    /** active | suspended | readonly */
    status: text('status').notNull().default('active'),

    /** Marca los tenants efimeros del sandbox de demostracion. */
    isDemo: boolean('is_demo').notNull().default(false),
    /** Solo lo llevan los sandboxes. Un tenant expirado es inaccesible de inmediato. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    baseCurrency: text('base_currency').notNull().default('USD'),
    /** Tasa VES/USD vigente, escalada x10^8. Ver ExchangeRate en el dominio. */
    exchangeRateScaled: bigint('exchange_rate_scaled', { mode: 'bigint' }),
    exchangeRateAt: timestamp('exchange_rate_at', { withTimezone: true }),

    /** Etiqueta del impuesto INFORMATIVO. No es un tributo declarado. */
    taxLabel: text('tax_label').default('Impuesto informativo'),
    /** Tasa en puntos basicos: 1600 = 16,00 %. */
    taxRateBp: integer('tax_rate_bp').notNull().default(1600),

    settings: jsonb('settings').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tenants_slug_key').on(t.slug),
    // Indice parcial: la purga de sandboxes solo mira filas con is_demo, asi que el
    // indice no carga con los tenants reales, que son la mayoria.
    index('tenants_demo_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.isDemo}`),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    tenantId: uuid('tenant_id').notNull(),
    /** Referencia a auth.users de Supabase; la FK se declara en la migracion SQL. */
    userId: uuid('user_id').notNull(),
    /** owner | admin | sales | warehouse | viewer — ver packages/domain/src/access. */
    role: text('role').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId] }),
    // "Mis empresas" en la pantalla de login: se consulta por usuario, no por tenant.
    index('memberships_user_idx').on(t.userId),
  ],
);

/**
 * Contadores de uso por recurso y periodo.
 *
 * Existe para evitar un `COUNT(*)` en cada escritura. Los mantienen triggers, y leer
 * una cuota es un SELECT por clave primaria. `period` vale 'total' para los recursos
 * acumulativos y 'YYYY-MM' para los que se reinician cada mes.
 */
export const tenantUsage = pgTable(
  'tenant_usage',
  {
    tenantId: uuid('tenant_id').notNull(),
    resource: text('resource').notNull(),
    period: text('period').notNull().default('total'),
    count: bigint('count', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.resource, t.period] })],
);

/**
 * Secuencias de numeracion por tenant y tipo de documento.
 *
 * Se consumen con SELECT ... FOR UPDATE dentro de la transaccion que emite el
 * documento. Es la razon por la que el proyecto necesita transacciones reales y no
 * puede usar PostgREST: sin bloqueo, dos ventas simultaneas obtienen el mismo numero.
 *
 * El correlativo es INTERNO de cada tenant y no tiene valor tributario alguno.
 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    tenantId: uuid('tenant_id').notNull(),
    /** quote | delivery_note | purchase_order | payment */
    docType: text('doc_type').notNull(),
    prefix: text('prefix').notNull().default(''),
    nextNumber: bigint('next_number', { mode: 'number' }).notNull().default(1),
    padding: integer('padding').notNull().default(6),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.docType] })],
);

/**
 * Registro de auditoria. APPEND-ONLY.
 *
 * Los permisos de UPDATE y DELETE se revocan a nivel de GRANT, no solo por politica
 * RLS: un registro de auditoria que se puede editar no es un registro de auditoria.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    summary: jsonb('summary'),
    diff: jsonb('diff'),
    /** Hash de la IP, nunca la IP en claro. El salt rota a diario. */
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_tenant_time_idx').on(t.tenantId, t.occurredAt.desc()),
    index('audit_log_entity_idx').on(t.tenantId, t.entityType, t.entityId),
  ],
);

/**
 * Estado global de la plataforma: el circuit breaker que protege el presupuesto.
 *
 * Sin esto, un pico de trafico o un abuso del sandbox agota la cuota gratuita y el
 * proyecto entero deja de responder, que es justo lo que no puede pasar en un enlace
 * que aparece en un CV.
 */
export const systemFlags = pgTable('system_flags', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Invitaciones al equipo.
 *
 * `tokenHash` y no `token`: lo que se guarda es el SHA-256 del valor entregado,
 * igual que una contrasena. Un token de invitacion es una credencial —quien lo
 * tenga entra con el rol que diga la fila— y guardarlo en claro convertiria
 * cualquier lectura de esta tabla en una entrada a la empresa.
 *
 * Espejo de supabase/migrations/20260907140000_invitations.sql.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),

    email: text('email').notNull(),
    /** admin | sales | warehouse | viewer. `owner` NO se invita: se transfiere. */
    role: text('role').notNull(),

    tokenHash: text('token_hash').notNull(),

    invitedBy: uuid('invited_by'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invitations_token_key').on(t.tokenHash),
    index('invitations_tenant_idx').on(t.tenantId, t.createdAt),
  ],
);
