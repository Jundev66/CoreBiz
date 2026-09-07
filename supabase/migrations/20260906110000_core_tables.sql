-- ============================================================================
-- Tablas de tenancy: quien es cada empresa, quien pertenece a ella y con que
-- limites opera.
--
-- Esta migracion va ANTES que las de RLS a proposito. Las politicas hacen
-- `alter table ... enable row level security` sobre estas tablas sin guarda, y
-- los `grant` del final de aquella migracion solo alcanzan a las tablas que ya
-- existen: no hay `alter default privileges`. Con el DDL despues, la migracion
-- de politicas falla y las tablas nuevas se quedan sin privilegios.
--
-- Espejo de packages/db/src/schema/tenancy.ts. El SQL manda; el esquema Drizzle
-- es el acceso tipado. Un test de integracion compara ambos para que no deriven.
--
-- Convenciones de todo el esquema:
--   - PK `uuid` v7 generada en la aplicacion. Lleva la marca temporal en los
--     bits altos, asi que ordena por fecha y mantiene sanos los indices B-tree.
--   - Dinero en `bigint` de unidades menores. Nunca float, nunca numeric.
--   - Todo indice compuesto empieza por `tenant_id`.
-- ============================================================================

create schema if not exists app;

-- Marca `updated_at` en cada escritura.
--
-- Sin esto la columna solo guarda el instante del INSERT, que es peor que no
-- tenerla: parece un dato fiable y no lo es.
create or replace function app.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id                    uuid primary key,
  slug                  text        not null,
  name                  text        not null,

  plan_code             text        not null default 'free',
  status                text        not null default 'active',

  -- Marca los tenants efimeros del sandbox de demostracion.
  is_demo               boolean     not null default false,
  -- Solo lo llevan los sandboxes. Un tenant expirado es inaccesible de
  -- inmediato: lo comprueba app.is_member(), sin esperar a que el cron purgue.
  expires_at            timestamptz,

  base_currency         text        not null default 'USD',
  -- Tasa VES/USD vigente, escalada x10^8. Ver ExchangeRate en el dominio.
  exchange_rate_scaled  bigint,
  exchange_rate_at      timestamptz,

  -- Etiqueta del impuesto INFORMATIVO. No es un tributo declarado.
  tax_label             text        default 'Impuesto informativo',
  -- Tasa en puntos basicos: 1600 = 16,00 %.
  tax_rate_bp           integer     not null default 1600,

  settings              jsonb       not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Las listas replican las del dominio (billing/plan.ts). Son defensa en
  -- profundidad: si un adaptador escribiera un valor invalido, se para aqui.
  constraint tenants_plan_code_check   check (plan_code in ('free', 'pro')),
  constraint tenants_status_check      check (status in ('active', 'suspended', 'readonly')),
  constraint tenants_currency_check    check (base_currency in ('USD', 'VES')),
  constraint tenants_tax_rate_check    check (tax_rate_bp between 0 and 10000),
  -- Un tenant real no caduca; uno de demostracion siempre.
  constraint tenants_demo_expiry_check check (is_demo or expires_at is null)
);

create unique index if not exists tenants_slug_key on public.tenants (slug);

-- Indice parcial: la purga de sandboxes solo mira filas con is_demo, asi que el
-- indice no carga con los tenants reales, que son la mayoria.
create index if not exists tenants_demo_expiry_idx
  on public.tenants (expires_at) where is_demo;

drop trigger if exists trg_tenants_touch on public.tenants;
create trigger trg_tenants_touch before update on public.tenants
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  tenant_id  uuid        not null references public.tenants (id) on delete cascade,
  -- La FK contra auth.users es la que hace que borrar una cuenta de Supabase no
  -- deje pertenencias huerfanas apuntando a un usuario que ya no existe.
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role       text        not null,
  status     text        not null default 'active',
  created_at timestamptz not null default now(),

  primary key (tenant_id, user_id),

  -- Replica ROLES de packages/domain/src/access/role.ts.
  constraint memberships_role_check   check (role in ('owner', 'admin', 'sales', 'warehouse', 'viewer')),
  constraint memberships_status_check check (status in ('active', 'invited', 'suspended'))
);

-- "Mis empresas" en la pantalla de acceso: se consulta por usuario, no por tenant.
create index if not exists memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- tenant_usage
--
-- Contadores por recurso y periodo. Existe para evitar un `count(*)` en cada
-- escritura: leer una cuota es un SELECT por clave primaria. `period` vale
-- 'total' para los recursos acumulativos y 'YYYY-MM' para los mensuales.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_usage (
  tenant_id  uuid        not null references public.tenants (id) on delete cascade,
  resource   text        not null,
  period     text        not null default 'total',
  count      bigint      not null default 0,
  updated_at timestamptz not null default now(),

  primary key (tenant_id, resource, period),
  -- Un contador negativo significa que alguien decremento de mas; que falle la
  -- escritura es mejor que arrastrar una cuota corrupta.
  constraint tenant_usage_count_check check (count >= 0)
);

drop trigger if exists trg_tenant_usage_touch on public.tenant_usage;
create trigger trg_tenant_usage_touch before update on public.tenant_usage
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- document_sequences
--
-- Se consumen con SELECT ... FOR UPDATE dentro de la transaccion que emite el
-- documento. Es la razon por la que el proyecto necesita transacciones reales y
-- no puede usar PostgREST: sin bloqueo, dos ventas simultaneas obtienen el mismo
-- numero. Tampoco sirve una SEQUENCE nativa: no se revierte, y un correlativo
-- con huecos no se puede explicar.
--
-- El correlativo es INTERNO de cada tenant y no tiene valor tributario alguno.
-- ---------------------------------------------------------------------------
create table if not exists public.document_sequences (
  tenant_id   uuid    not null references public.tenants (id) on delete cascade,
  doc_type    text    not null,
  prefix      text    not null default '',
  next_number bigint  not null default 1,
  padding     integer not null default 6,

  primary key (tenant_id, doc_type),

  constraint document_sequences_type_check    check (doc_type in ('quote', 'delivery_note', 'purchase_order', 'payment')),
  constraint document_sequences_next_check    check (next_number >= 1),
  constraint document_sequences_padding_check check (padding between 1 and 12)
);

-- ---------------------------------------------------------------------------
-- audit_log — APPEND-ONLY
--
-- Los permisos de UPDATE y DELETE se revocan por GRANT en la migracion de
-- politicas, no solo por RLS: un registro de auditoria que se puede editar no es
-- un registro de auditoria.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          uuid        primary key,
  tenant_id   uuid        not null references public.tenants (id) on delete cascade,
  actor_id    uuid,
  actor_email text,
  action      text        not null,
  entity_type text,
  entity_id   uuid,
  summary     jsonb,
  diff        jsonb,
  -- Hash de la IP, nunca la IP en claro. El salt rota a diario.
  ip_hash     text,
  user_agent  text,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_log_tenant_time_idx
  on public.audit_log (tenant_id, occurred_at desc);
create index if not exists audit_log_entity_idx
  on public.audit_log (tenant_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- system_flags — estado global de la plataforma.
--
-- Lo lee el circuit breaker que protege el presupuesto de la capa gratuita. No
-- lleva tenant_id: es la unica tabla del esquema que no pertenece a nadie.
-- ---------------------------------------------------------------------------
create table if not exists public.system_flags (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_system_flags_touch on public.system_flags;
create trigger trg_system_flags_touch before update on public.system_flags
  for each row execute function app.touch_updated_at();
