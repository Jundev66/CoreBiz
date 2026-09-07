-- ============================================================================
-- Sandbox de demostracion efimero
--
-- Convierte el proyecto en un enlace que se puede abrir: cada visitante recibe
-- SU PROPIA copia del tenant de demostracion, opera el ciclo completo, y a las
-- 24 horas desaparece.
--
-- Todo lo de este archivo esta escrito contra una restriccion concreta: 500 MB
-- de base de datos en el plan gratuito de Supabase. La pregunta que gobierna
-- cada decision no es "como creo un sandbox" sino "que pasa cuando alguien
-- publica el enlace en un agregador y llegan mil visitas en una hora".
--
-- La respuesta es que la aplicacion DEGRADA en lugar de caer. Un error de cuota
-- en el enlace del CV es el peor resultado posible del proyecto entero: peor que
-- no tener demo, porque parece que el sistema esta roto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- demo_sessions
--
-- Un sandbox vivo por visitante. `ip_hash` NO es la IP: es su SHA-256 con una
-- sal que rota a diario, igual que en el limitador de peticiones. Sirve para
-- reconocer que dos peticiones vienen del mismo sitio dentro de la misma hora, y
-- deja de servir para nada al dia siguiente — que es exactamente lo que se
-- quiere de un dato que solo existe para frenar abuso.
-- ---------------------------------------------------------------------------
create table if not exists public.demo_sessions (
  id         uuid primary key,
  tenant_id  uuid        not null references public.tenants (id) on delete cascade,
  ip_hash    text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists demo_sessions_expiry_idx on public.demo_sessions (expires_at);
create index if not exists demo_sessions_ip_idx on public.demo_sessions (ip_hash, created_at desc);

-- Nadie la lee desde la aplicacion con rol `authenticated`: la gestionan las
-- funciones de abajo, que corren con privilegios propios.
alter table public.demo_sessions enable row level security;
alter table public.demo_sessions force row level security;
revoke all on public.demo_sessions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- El clonado
-- ---------------------------------------------------------------------------

/**
 * Copia el tenant de demostracion entero para un visitante nuevo.
 *
 * LA IDEA QUE HACE QUE ESTO QUEPA EN UNA FUNCION Y NO EN UN SCRIPT:
 *
 * Los identificadores nuevos NO se generan al azar ni se guardan en una tabla de
 * correspondencias. Se DERIVAN: `uuid_generate_v5(nuevo_tenant, id_viejo::text)`.
 * La misma entrada da siempre la misma salida, asi que una clave foranea se
 * remapea aplicando la misma formula al identificador al que apunta — sin
 * consultar nada y sin importar el orden en que se copien las tablas.
 *
 * Con una tabla de correspondencias habria que copiar en orden de dependencias,
 * mantener el mapa vivo durante toda la transaccion y limpiarlo despues. Con
 * uuid v5 no hay orden, no hay mapa y no hay limpieza: cada `insert ... select`
 * es independiente de los demas.
 *
 * Todo ocurre en UNA transaccion. Un sandbox a medias —con productos pero sin
 * sus movimientos, o con notas apuntando a clientes que no se copiaron— seria
 * peor que ninguno: el visitante veria un sistema roto y pensaria que asi es
 * como funciona.
 */
create or replace function app.clone_demo_tenant(
  p_template  uuid,
  p_ip_hash   text default null,
  p_ttl_hours integer default 24
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_new    uuid := extensions.uuid_generate_v4();
  v_expiry timestamptz := now() + make_interval(hours => p_ttl_hours);
begin
  if not exists (select 1 from public.tenants where id = p_template and is_demo) then
    -- Solo se clona una plantilla marcada como demostracion. Sin esta guarda,
    -- un parametro equivocado copiaria la empresa de un cliente real.
    raise exception 'NOT_A_DEMO_TEMPLATE: la plantilla no existe o no es de demostracion'
      using errcode = 'P0001';
  end if;

  -- El tenant. `expires_at` es lo que lo hace efimero: `app.is_member()` lo
  -- comprueba, asi que deja de ser accesible EN EL ACTO al caducar, sin esperar
  -- a que el cron lo purgue. La purga es higiene de espacio, no la medida.
  insert into public.tenants (
    id, slug, name, plan_code, status, is_demo, expires_at,
    base_currency, exchange_rate_scaled, exchange_rate_at,
    tax_label, tax_rate_bp, settings
  )
  select
    v_new,
    'demo-' || substr(v_new::text, 1, 8),
    t.name,
    t.plan_code, t.status, true, v_expiry,
    t.base_currency, t.exchange_rate_scaled, t.exchange_rate_at,
    t.tax_label, t.tax_rate_bp, t.settings
  from public.tenants t
  where t.id = p_template;

  -- Las pertenencias se copian tal cual: el sandbox lo opera el mismo usuario de
  -- demostracion que la plantilla, sin sesion propia.
  insert into public.memberships (tenant_id, user_id, role, status, created_at)
  select v_new, m.user_id, m.role, m.status, m.created_at
    from public.memberships m
   where m.tenant_id = p_template;

  insert into public.customers (
    id, tenant_id, code, name, tax_id, email, phone, address,
    credit_limit_minor, credit_limit_currency, archived_at, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, c.id::text), v_new,
    c.code, c.name, c.tax_id, c.email, c.phone, c.address,
    c.credit_limit_minor, c.credit_limit_currency, c.archived_at, c.created_at
  from public.customers c
  where c.tenant_id = p_template;

  insert into public.products (
    id, tenant_id, sku, name, description, unit,
    price_minor, price_currency, cost_minor, cost_currency,
    taxable, track_stock, on_hand, min_stock, stock_policy, archived_at, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, p.id::text), v_new,
    p.sku, p.name, p.description, p.unit,
    p.price_minor, p.price_currency, p.cost_minor, p.cost_currency,
    p.taxable, p.track_stock, p.on_hand, p.min_stock, p.stock_policy,
    p.archived_at, p.created_at
  from public.products p
  where p.tenant_id = p_template;

  -- El libro mayor se copia entero. Sin el, el sandbox tendria saldos que nada
  -- explica, y la primera pantalla que alguien abriria seria justo la que
  -- demuestra que el inventario es auditable.
  insert into public.stock_movements (
    id, tenant_id, product_id, kind, quantity, balance_after,
    ref_type, ref_id, note, occurred_at, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, sm.id::text), v_new,
    extensions.uuid_generate_v5(v_new, sm.product_id::text),
    sm.kind, sm.quantity, sm.balance_after,
    sm.ref_type,
    -- `ref_id` es texto y guarda el identificador del documento origen. Se
    -- remapea si parece un uuid; si no, se deja como esta ('initial' no lleva).
    case
      when sm.ref_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then extensions.uuid_generate_v5(v_new, sm.ref_id)::text
      else sm.ref_id
    end,
    sm.note, sm.occurred_at, sm.created_at
  from public.stock_movements sm
  where sm.tenant_id = p_template;

  insert into public.delivery_notes (
    id, tenant_id, number, customer_id, quote_id, status, currency,
    exchange_rate_scaled, exchange_rate_from, exchange_rate_to, exchange_rate_at,
    tax_label_snapshot, tax_rate_bp_snapshot,
    subtotal_minor, tax_minor, total_minor, total_secondary_minor,
    issued_at, issued_by, delivered_at, received_by, voided_at, void_reason,
    notes, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, dn.id::text), v_new,
    dn.number,
    extensions.uuid_generate_v5(v_new, dn.customer_id::text),
    null,
    dn.status, dn.currency,
    dn.exchange_rate_scaled, dn.exchange_rate_from, dn.exchange_rate_to, dn.exchange_rate_at,
    dn.tax_label_snapshot, dn.tax_rate_bp_snapshot,
    dn.subtotal_minor, dn.tax_minor, dn.total_minor, dn.total_secondary_minor,
    dn.issued_at, dn.issued_by, dn.delivered_at, dn.received_by,
    dn.voided_at, dn.void_reason, dn.notes, dn.created_at
  from public.delivery_notes dn
  where dn.tenant_id = p_template;

  insert into public.delivery_note_lines (
    tenant_id, delivery_note_id, line_no, product_id,
    description_snapshot, unit_snapshot,
    quantity, unit_price_minor, discount_bp, taxable, line_total_minor
  )
  select
    v_new,
    extensions.uuid_generate_v5(v_new, l.delivery_note_id::text),
    l.line_no,
    extensions.uuid_generate_v5(v_new, l.product_id::text),
    l.description_snapshot, l.unit_snapshot,
    l.quantity, l.unit_price_minor, l.discount_bp, l.taxable, l.line_total_minor
  from public.delivery_note_lines l
  where l.tenant_id = p_template;

  insert into public.suppliers (
    id, tenant_id, code, name, tax_id, email, phone, contact_name, notes,
    archived_at, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, s.id::text), v_new,
    s.code, s.name, s.tax_id, s.email, s.phone, s.contact_name, s.notes,
    s.archived_at, s.created_at
  from public.suppliers s
  where s.tenant_id = p_template;

  insert into public.goods_receipts (
    id, tenant_id, number, supplier_id, purchase_order_id, status, currency,
    total_minor, supplier_reference, notes,
    received_at, received_by, voided_at, void_reason, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, g.id::text), v_new,
    g.number,
    extensions.uuid_generate_v5(v_new, g.supplier_id::text),
    null,
    g.status, g.currency, g.total_minor, g.supplier_reference, g.notes,
    g.received_at, g.received_by, g.voided_at, g.void_reason, g.created_at
  from public.goods_receipts g
  where g.tenant_id = p_template;

  insert into public.goods_receipt_lines (
    tenant_id, goods_receipt_id, line_no, product_id,
    description_snapshot, unit_snapshot, quantity, unit_cost_minor, line_total_minor
  )
  select
    v_new,
    extensions.uuid_generate_v5(v_new, l.goods_receipt_id::text),
    l.line_no,
    extensions.uuid_generate_v5(v_new, l.product_id::text),
    l.description_snapshot, l.unit_snapshot,
    l.quantity, l.unit_cost_minor, l.line_total_minor
  from public.goods_receipt_lines l
  where l.tenant_id = p_template;

  -- El correlativo tiene que continuar donde lo dejo la plantilla: si empezara
  -- en uno, la primera nota que emitiera el visitante chocaria contra el indice
  -- unico (tenant_id, number) de las que se acaban de copiar.
  insert into public.document_sequences (tenant_id, doc_type, prefix, next_number, padding)
  select v_new, d.doc_type, d.prefix, d.next_number, d.padding
    from public.document_sequences d
   where d.tenant_id = p_template;

  insert into public.tenant_usage (tenant_id, resource, period, count)
  select v_new, u.resource, u.period, u.count
    from public.tenant_usage u
   where u.tenant_id = p_template;

  -- La AUDITORIA no se copia, a proposito. El sandbox tiene que poder ensenar el
  -- visor de actividad, y lo interesante es ver aparecer ahi lo que uno mismo
  -- acaba de hacer — no el historial de otro.

  insert into public.demo_sessions (id, tenant_id, ip_hash, expires_at)
  values (extensions.uuid_generate_v4(), v_new, p_ip_hash, v_expiry);

  return v_new;
end $fn$;

revoke all on function app.clone_demo_tenant(uuid, text, integer) from public;

-- ---------------------------------------------------------------------------
-- Purga y capacidad
-- ---------------------------------------------------------------------------

/**
 * Borra los sandboxes caducados.
 *
 * Una sola sentencia: las cascadas de `tenant_id` se llevan todo lo demas, y las
 * claves foraneas entre documentos y maestros son `deferrable initially
 * deferred` precisamente para que esto funcione. Sin eso, Postgres no garantiza
 * el orden en que resuelve las cascadas y el borrado fallaria a mitad.
 */
create or replace function app.purge_expired_demos() returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_deleted integer;
begin
  delete from public.tenants
   where is_demo and expires_at is not null and expires_at < now()
     -- La plantilla no caduca nunca, pero la guarda va explicita: un
     -- `expires_at` puesto por error en la plantilla borraria la demostracion
     -- entera y no habria nada que clonar.
     and id <> '00000000-0000-4000-8000-000000000001';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end $fn$;

revoke all on function app.purge_expired_demos() from public;

/**
 * En que modo debe operar la provision de sandboxes.
 *
 * `normal`   — se crean sandboxes con normalidad.
 * `degraded` — por encima del 70 % del presupuesto: se deja de crear y se sirve
 *              la plantilla compartida en solo lectura. El visitante SIGUE VIENDO
 *              el sistema funcionando, que es lo unico que importa.
 * `critical` — por encima del 85 %: ademas se purga sin esperar al TTL.
 *
 * El umbral esta en el 70 y no en el 95 a proposito. Degradar tarde es no
 * degradar: entre que se cruza el umbral y que el cron actua caben muchas
 * visitas, y la unica forma de no quedarse sin espacio es dejar de gastarlo
 * antes de que sea urgente.
 */
create or replace function app.demo_capacity(p_budget_bytes bigint default 500000000)
returns table (mode text, used_bytes bigint, ratio numeric, active_sandboxes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with medida as (
    select
      pg_database_size(current_database()) as used,
      (select count(*)::int from public.demo_sessions where expires_at > now()) as vivos
  )
  select
    case
      when used::numeric / greatest(p_budget_bytes, 1) >= 0.85 then 'critical'
      when used::numeric / greatest(p_budget_bytes, 1) >= 0.70 then 'degraded'
      else 'normal'
    end,
    used,
    round(used::numeric / greatest(p_budget_bytes, 1), 4),
    vivos
  from medida
$$;

revoke all on function app.demo_capacity(bigint) from public;

-- ---------------------------------------------------------------------------
-- El cron
--
-- Va DENTRO de Postgres y no en el cron de Vercel porque el plan Hobby solo
-- admite ejecuciones diarias, y un TTL de 24 horas con purga diaria significa
-- que un sandbox puede vivir hasta 48. Con pg_cron cada diez minutos, el espacio
-- se libera cuando toca.
--
-- Se registra solo si la extension esta disponible: en el Supabase local no
-- viene instalada, y una migracion que falla ahi rompe `pnpm db:start` para
-- todo el mundo por una tarea que en desarrollo no hace falta.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    perform cron.unschedule('corebiz-purge-demos')
      where exists (select 1 from cron.job where jobname = 'corebiz-purge-demos');

    perform cron.schedule(
      'corebiz-purge-demos',
      '*/10 * * * *',
      $cron$
        select app.purge_expired_demos();
        select security.purge_rate_limits();
        select app.release_expired_invitations();
      $cron$
    );
  else
    raise notice 'pg_cron no disponible: la purga automatica no queda programada.';
  end if;
end $$;
