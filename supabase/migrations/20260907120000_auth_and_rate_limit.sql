-- ============================================================================
-- Autenticacion, alta de cuenta y limitacion de peticiones
--
-- Todo lo que aqui se define existe porque la aplicacion pasa de "una demo con
-- dos cookies" a "un sistema con sesiones reales", y eso abre tres superficies
-- que antes no existian: alguien puede registrarse, alguien puede intentar
-- adivinar una contrasena, y alguien puede intentar entrar a un tenant ajeno.
--
-- Ver docs/adr/005-aislamiento-multi-tenant.md y docs/THREAT_MODEL.md.
-- ============================================================================

create schema if not exists security;

-- ─────────────────────────────────────────────────────────────────────────────
-- LIMITACION DE PETICIONES
--
-- Vive en Postgres y no en Redis, ni en Upstash, ni en el middleware. Tres
-- razones, en orden de importancia:
--
--   1. Un contador en memoria de proceso NO limita nada en serverless: cada
--      instancia de funcion tiene el suyo, y Vercel levanta las que hagan falta.
--      Diez instancias con "5 intentos cada una" son cincuenta intentos.
--   2. La base de datos ya esta ahi y ya es transaccional. Un UPSERT atomico
--      resuelve la carrera entre dos peticiones simultaneas sin coordinacion
--      externa.
--   3. Cuesta cero euros y un servicio menos que pueda caerse. En un proyecto
--      cuyo presupuesto de operacion es $0, eso no es tacaneria: es la
--      restriccion de diseno.
--
-- El coste es una escritura por intento. Se acota con la purga de abajo y con
-- ventanas cortas.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists security.rate_limits (
  -- Identifica QUE se esta limitando y A QUIEN. Se compone en la aplicacion
  -- ('login:' || hash_de_ip). Nunca lleva la IP en claro ni el correo.
  bucket       text        not null,
  -- Inicio de la ventana, truncado. Forma parte de la clave para que la ventana
  -- siguiente sea una fila NUEVA en vez de una actualizacion con condicion: asi
  -- no hay que decidir "esta caducada?" en medio de un UPSERT concurrente.
  window_start timestamptz not null,
  hits         integer     not null default 0,

  primary key (bucket, window_start)
);

-- La purga borra por antiguedad, asi que necesita este orden y no el de la PK.
create index if not exists rate_limits_window_idx
  on security.rate_limits (window_start);

/**
 * Registra un intento y dice si se admite.
 *
 * UN solo UPSERT. Es lo que lo hace correcto bajo concurrencia: leer el contador
 * y despues escribirlo deja una ventana entre ambas operaciones en la que caben
 * otras peticiones, y bajo un ataque de fuerza bruta —que es exactamente cuando
 * esto tiene que funcionar— esa ventana se llena. `hits` lo incrementa la base de
 * datos sobre el valor actual, no la aplicacion sobre un valor que leyo antes.
 *
 * Devuelve la decision en lugar de lanzar: quien llama necesita `remaining` y
 * `retry_after` para poder responder un 429 util, y una excepcion no los trae.
 *
 * SECURITY DEFINER porque la tabla no esta expuesta a nadie: el unico camino
 * hacia ella es esta funcion, y asi un rol de aplicacion no puede borrar sus
 * propios contadores para saltarse el limite.
 */
create or replace function security.rate_limit_hit(
  p_bucket  text,
  p_limit   integer,
  p_window  integer default 60
) returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_start timestamptz;
  v_hits  integer;
begin
  if p_limit < 1 or p_window < 1 then
    raise exception 'RATE_LIMIT_CONFIG: limite y ventana tienen que ser positivos';
  end if;

  -- Ventanas fijas alineadas al reloj. Una ventana deslizante seria mas precisa
  -- y necesitaria guardar cada intento; para frenar fuerza bruta y abuso del
  -- sandbox, la precision extra no compensa multiplicar por N las filas.
  v_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window) * p_window);

  insert into security.rate_limits (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start)
    do update set hits = security.rate_limits.hits + 1
  returning security.rate_limits.hits into v_hits;

  return query select
    v_hits <= p_limit,
    greatest(0, p_limit - v_hits),
    -- Segundos que faltan para que la ventana se cierre. Es lo que va en la
    -- cabecera `Retry-After`, para que quien reciba el 429 sepa cuando volver.
    greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window)) - clock_timestamp()))::integer);
end $fn$;

/**
 * Borra las ventanas ya cerradas.
 *
 * Sin esto la tabla crece para siempre con contadores que ya no deciden nada. La
 * llama el cron junto a la purga de sandboxes; tambien es seguro llamarla a mano.
 */
create or replace function security.purge_rate_limits(p_older_than interval default interval '1 day')
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_deleted integer;
begin
  delete from security.rate_limits where window_start < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $fn$;

-- La tabla no se toca desde fuera: solo a traves de la funcion.
revoke all on schema security from public;
revoke all on all tables in schema security from public;
revoke all on function security.rate_limit_hit(text, integer, integer) from public;
revoke all on function security.purge_rate_limits(interval) from public;

grant usage on schema security to authenticated, anon;
grant execute on function security.rate_limit_hit(text, integer, integer) to authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTA DE CUENTA
--
-- Crear una empresa toca cuatro tablas y no admite quedarse a medias: un tenant
-- sin propietario es una empresa a la que nadie puede entrar y que nadie puede
-- borrar por la interfaz. O ocurre todo, o no ocurre nada.
--
-- Va en SQL y no en TypeScript porque la politica `tenants_insert` es
-- `with check (false)`: NADIE crea empresas escribiendo en la tabla, ni siquiera
-- un usuario autenticado. El unico camino es esta funcion, que corre con los
-- privilegios de su creador y valida por su cuenta quien la esta llamando.
--
-- La alternativa —hacerlo desde la aplicacion con la clave de servicio— pondria
-- una credencial que salta TODAS las politicas en el camino de un request
-- publico, que es justo lo que el modelo de amenazas prohibe.
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza un nombre de empresa a un identificador de URL.
 *
 * `unaccent` no esta disponible por defecto en Supabase, asi que la
 * transliteracion va a mano. Es fea y es corta, y evita anadir una extension
 * entera para diez caracteres.
 */
create or replace function app.slugify(p_text text) returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from
    regexp_replace(
      lower(translate(p_text,
        'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
        'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
      '[^a-z0-9]+', '-', 'g'
    )
  )
$$;

/**
 * Crea la empresa del usuario que acaba de registrarse.
 *
 * Devuelve el identificador del tenant. Falla —y revierte— si el usuario ya
 * tiene una empresa propia, para que un doble envio del formulario de registro
 * no deje dos empresas vacias con el mismo dueno.
 *
 * El slug se desambigua con un sufijo numerico en lugar de fallar: quien acaba
 * de crear su cuenta no tiene por que entender por que "Panaderia Santa Rosa" ya
 * esta cogido, ni deberia tener que inventarse otro nombre para su propio
 * negocio.
 */
create or replace function app.provision_tenant(
  p_name          text,
  p_base_currency text default 'USD',
  p_tax_label     text default 'Impuesto informativo',
  p_tax_rate_bp   integer default 1600
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid := extensions.uuid_generate_v4();
  v_base   text;
  v_slug   text;
  v_try    integer := 0;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED: hace falta una sesion para crear una empresa'
      using errcode = 'P0001';
  end if;

  if length(coalesce(trim(p_name), '')) < 2 then
    raise exception 'INVALID_NAME: el nombre de la empresa es demasiado corto'
      using errcode = 'P0001';
  end if;

  if p_base_currency not in ('USD', 'VES') then
    raise exception 'INVALID_CURRENCY: moneda no soportada' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.memberships m
     where m.user_id = v_user and m.role = 'owner' and m.status = 'active'
  ) then
    raise exception 'ALREADY_OWNER: este usuario ya tiene una empresa'
      using errcode = 'P0001';
  end if;

  v_base := coalesce(nullif(app.slugify(p_name), ''), 'empresa');
  v_slug := v_base;
  while exists (select 1 from public.tenants t where t.slug = v_slug) loop
    v_try  := v_try + 1;
    v_slug := v_base || '-' || v_try::text;
    if v_try > 50 then
      v_slug := v_base || '-' || substr(v_tenant::text, 1, 8);
      exit;
    end if;
  end loop;

  insert into public.tenants (
    id, slug, name, plan_code, status, is_demo,
    base_currency, tax_label, tax_rate_bp
  ) values (
    v_tenant, v_slug, trim(p_name), 'free', 'active', false,
    p_base_currency, p_tax_label, p_tax_rate_bp
  );

  insert into public.memberships (tenant_id, user_id, role, status)
  values (v_tenant, v_user, 'owner', 'active');

  -- El correlativo se crea aqui para que la primera nota de entrega no dependa
  -- de un alta implicita en medio de la transaccion que la emite.
  insert into public.document_sequences (tenant_id, doc_type, prefix, next_number, padding)
  values (v_tenant, 'delivery_note', 'NE', 1, 6);

  -- El contador de usuarios arranca en 1: quien crea la empresa ya ocupa plaza.
  -- Dejarlo en cero haria que el plan gratuito admitiese un usuario de mas.
  insert into public.tenant_usage (tenant_id, resource, period, count)
  values (v_tenant, 'users', 'total', 1);

  return v_tenant;
end $fn$;

revoke all on function app.provision_tenant(text, text, text, integer) from public;
grant execute on function app.provision_tenant(text, text, text, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- EMPRESAS DEL USUARIO
--
-- La pantalla de acceso necesita saber a que empresas pertenece quien entra, y
-- el middleware necesita comprobar que el tenant pedido por URL es una de ellas.
-- Ambas cosas ocurren ANTES de que exista contexto de tenant, asi que no pueden
-- resolverse con las politicas normales, que dependen de app.current_tenant().
--
-- Por eso es una funcion acotada: devuelve solo las membresias del usuario que
-- llama —nunca acepta un identificador de usuario como parametro— de modo que no
-- hay forma de preguntarle por las empresas de otro.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function app.my_memberships()
returns table (
  tenant_id   uuid,
  slug        text,
  name        text,
  role        text,
  plan_code   text,
  is_demo     boolean,
  status      text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.slug, t.name, m.role, t.plan_code, t.is_demo, t.status
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = auth.uid()
     and m.status = 'active'
     and t.status <> 'suspended'
     and (t.expires_at is null or t.expires_at > now())
   order by t.name
$$;

revoke all on function app.my_memberships() from public;
grant execute on function app.my_memberships() to authenticated;
