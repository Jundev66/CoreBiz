-- ============================================================================
-- Credenciales propias para cada visitante de la demostracion
--
-- Hasta aqui, quien abria el enlace entraba SIN SESION: una cookie firmada
-- decia que sandbox le tocaba y la aplicacion se fiaba de ella. Funcionaba, pero
-- tenia dos costes que no se ven hasta que se miran de cerca.
--
-- El primero es que nunca se veia el sistema entero. Un ERP sin acceso es medio
-- sistema, y el acceso es justo la parte donde se demuestra que hay control de
-- identidad de verdad y no una pantalla pintada.
--
-- El segundo es peor: obligaba a mantener viva una rama que resuelve el contexto
-- del tenant SIN identidad verificada. Esa rama es la superficie mas delicada de
-- todo el sistema — un error ahi no da un fallo, da una empresa abierta. Con
-- credenciales de verdad deja de hacer falta y se puede borrar.
--
-- El usuario que se crea aqui es tan efimero como su tenant: nace en la misma
-- transaccion, lleva la misma caducidad y se lo lleva la misma purga.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A que usuario pertenece cada sandbox
--
-- Se guarda AQUI y no se deduce de `memberships` porque la purga necesita saber
-- a quien borrar DESPUES de haber borrado el tenant, y para entonces la
-- pertenencia ya se fue en cascada. Sin esta columna habria que elegir entre
-- dejar usuarios huerfanos o recorrer `auth.users` entera buscandolos.
-- ---------------------------------------------------------------------------
alter table public.demo_sessions add column if not exists user_id uuid;

-- Que clase de visitante es.
--
--   `sandbox` — tiene su propia copia de la plantilla y puede escribir en ella.
--   `viewer`  — entra en SOLO LECTURA sobre la plantilla compartida.
--
-- El segundo es el modo degradado, y existe porque el peor resultado posible del
-- enlace del CV es una pantalla que diga "vuelve mas tarde" justo cuando alguien
-- se ha molestado en abrirlo. Cuando no cabe otra copia de la base, se sigue
-- entregando una cuenta de verdad: lo unico que cambia es que no puede escribir.
-- Cuesta una fila en lugar de sesenta.
--
-- La distincion no es cosmetica: `app.demo_capacity()` cuenta sandboxes para
-- decidir si hay sitio, y contar ahi a los visitantes de solo lectura —que no
-- ocupan nada— dejaria el sistema atascado en modo degradado para siempre en
-- cuanto se llenara una vez.
alter table public.demo_sessions
  add column if not exists kind text not null default 'sandbox';

alter table public.demo_sessions drop constraint if exists demo_sessions_kind_check;
alter table public.demo_sessions
  add constraint demo_sessions_kind_check check (kind in ('sandbox', 'viewer'));

-- ---------------------------------------------------------------------------
-- La provision completa: identidad + datos
-- ---------------------------------------------------------------------------

/**
 * Crea el visitante y su sandbox en una sola transaccion.
 *
 * Es una envoltura sobre `app.clone_demo_tenant()` y no una version ampliada de
 * ella, y la separacion tiene una razon: clonar es copiar diecisiete tablas con
 * sus columnas enumeradas una a una. Duplicar ese cuerpo para anadirle un
 * usuario habria dejado dos listas de columnas que se van separando en silencio
 * cada vez que alguien anada un campo a una tabla. Aqui, clonar sigue siendo
 * copiar datos y esta funcion es la que anade identidad.
 *
 * La contrasena la genera la aplicacion con `randomBytes` y llega en claro, como
 * parametro ligado, para cifrarla aqui con `bcrypt`. Se penso hacerlo en Node y
 * mandar solo el hash, y no compensa: un instante despues esa misma contrasena
 * viaja a GoTrue para iniciar la sesion, asi que la exposicion es exactamente la
 * misma y lo unico que se gana es una dependencia de bcrypt en JavaScript. Como
 * parametro ligado no entra en `pg_stat_statements`, que normaliza los
 * parametros fuera del texto que guarda.
 *
 * No hace falta `SUPABASE_SERVICE_ROLE_KEY` para nada de esto. Se escribe en
 * `auth.users` porque la funcion es `security definer` y corre como su
 * propietario, y esta revocada de `public`. Meter en el sistema una clave capaz
 * de saltarse RLS para ahorrarse veinte lineas de SQL seria mal negocio.
 */
-- `create or replace` no puede cambiar el tipo de retorno de una funcion que ya
-- existe, y esta migracion se reaplica en cada `supabase db reset`.
drop function if exists app.provision_demo_session(uuid, text, text, text, integer, boolean);

create or replace function app.provision_demo_session(
  p_template  uuid,
  p_email     text,
  p_password  text,
  p_ip_hash   text default null,
  p_ttl_hours integer default 24,
  p_readonly  boolean default false
)
-- Las columnas de salida se llaman `out_*` y no `tenant_id` / `user_id` a
-- proposito: en plpgsql, un parametro OUT es una variable, y una variable
-- llamada igual que una columna hace que Postgres rechace por ambiguo cualquier
-- `where tenant_id = ...` del cuerpo. Es un fallo que solo aparece en ejecucion.
returns table (out_tenant uuid, out_user uuid)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_tenant uuid;
  v_user   uuid := extensions.uuid_generate_v4();
  v_expiry timestamptz := now() + make_interval(hours => p_ttl_hours);
begin
  if p_email is null or p_email = '' or p_password is null or p_password = '' then
    raise exception 'MISSING_CREDENTIALS: el sandbox necesita correo y contrasena'
      using errcode = 'P0001';
  end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- El usuario
  --
  -- Las cuatro columnas de token van a CADENA VACIA y no se dejan en NULL, que
  -- es lo que Postgres pondria. GoTrue las lee en variables de texto que no
  -- admiten nulo, asi que con NULL el acceso falla entero con un
  -- "Database error querying schema" que no menciona ni la columna ni la tabla.
  -- Media hora de depuracion por cuatro cadenas vacias; esta escrito dos veces
  -- en este repositorio para no volver a pagarla.
  --
  -- `email_confirmed_at` va relleno porque el dominio `@corebiz.demo` NO EXISTE:
  -- no hay buzon al que mandar una confirmacion, y no haberlo puesto dejaria la
  -- cuenta inaccesible esperando un correo que nadie va a recibir. Que el
  -- dominio no exista tambien es lo que garantiza que este sistema no envie
  -- correo a nadie por mucho que se abuse del enlace.
  -- ─────────────────────────────────────────────────────────────────────────
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '', '', '', '',
    -- `is_demo` en los metadatos de APLICACION y no en los de usuario: los de
    -- usuario son editables por su propio dueno desde el cliente. Una bandera
    -- que decide si una cuenta se puede borrar no puede vivir donde la escribe
    -- quien seria borrado.
    '{"provider":"email","providers":["email"],"is_demo":true}'::jsonb,
    '{"name":"Visitante"}'::jsonb
  );

  -- Sin esta fila, GoTrue no reconoce que la cuenta tiene un metodo de acceso
  -- por correo y contrasena: el usuario existe y aun asi no puede entrar.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_user::text, v_user,
    jsonb_build_object('sub', v_user::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  -- ─────────────────────────────────────────────────────────────────────────
  -- Los datos
  -- ─────────────────────────────────────────────────────────────────────────
  if p_readonly then
    -- Modo degradado. La misma guarda que en el clonado, y por la misma razon:
    -- sin ella, un identificador mal puesto daria acceso de lectura a la
    -- empresa de un cliente real.
    if not exists (select 1 from public.tenants where id = p_template and is_demo) then
      raise exception 'NOT_A_DEMO_TEMPLATE: la plantilla no existe o no es de demostracion'
        using errcode = 'P0001';
    end if;

    v_tenant := p_template;

    -- `viewer` es lo que impide que un visitante degradado escriba en la
    -- plantilla que todos los demas van a clonar. Un solo alta suya quedaria en
    -- todas las copias posteriores.
    insert into public.memberships (tenant_id, user_id, role, status, created_at)
    values (v_tenant, v_user, 'viewer', 'active', now());

    insert into public.demo_sessions (id, tenant_id, user_id, ip_hash, kind, expires_at)
    values (extensions.uuid_generate_v4(), v_tenant, v_user, p_ip_hash, 'viewer', v_expiry);
  else
    v_tenant := app.clone_demo_tenant(p_template, p_ip_hash, p_ttl_hours);

    -- El clonado copia las pertenencias de la plantilla, que apuntan al usuario
    -- de demostracion compartido. Aqui se sustituyen por la del visitante: su
    -- sandbox es SUYO, y que el usuario compartido siguiera teniendo acceso
    -- convertiria cincuenta demostraciones aisladas en cincuenta demostraciones
    -- que una sola cuenta puede recorrer enteras.
    --
    -- Se INSERTA ANTES DE BORRAR, y no al reves. `app.enforce_last_owner()` se
    -- dispara al borrar la ultima pertenencia de propietario de un tenant, y con
    -- el orden intuitivo —borrar y luego insertar— la funcion entera falla. Ese
    -- trigger existe para que nadie se deje fuera de su propia empresa por
    -- accidente, y tiene razon tambien aqui.
    insert into public.memberships (tenant_id, user_id, role, status, created_at)
    values (v_tenant, v_user, 'owner', 'active', now());

    delete from public.memberships m
     where m.tenant_id = v_tenant and m.user_id <> v_user;

    update public.demo_sessions d set user_id = v_user where d.tenant_id = v_tenant;
  end if;

  return query select v_tenant, v_user;
end $fn$;

revoke all on function app.provision_demo_session(uuid, text, text, text, integer, boolean) from public;
revoke all on function app.provision_demo_session(uuid, text, text, text, integer, boolean) from authenticated, anon;

-- ---------------------------------------------------------------------------
-- La purga, ahora tambien de usuarios
-- ---------------------------------------------------------------------------

/**
 * Borra los sandboxes caducados y las cuentas que los operaban.
 *
 * El orden no es negociable: los identificadores de usuario se recogen ANTES de
 * borrar los tenants, porque `demo_sessions` se va en cascada con el tenant y
 * despues ya no habria forma de saber a quien borrar. Una cuenta huerfana no
 * rompe nada visible, y por eso mismo se acumularia durante meses sin que nadie
 * lo notase — que es exactamente como se llega a un cobro inesperado.
 *
 * Dos guardas sobre el borrado de cuentas, y las dos hacen falta:
 *
 *   1. La cuenta tiene que estar marcada `is_demo` en sus metadatos de
 *      aplicacion. Es la bandera que puso esta misma funcion al crearla.
 *   2. No puede quedarle NINGUNA pertenencia. Si la cuenta entro en otra
 *      empresa —hoy imposible, manana quien sabe— deja de ser desechable.
 *
 * Con una sola de las dos bastaria hoy. Con las dos, sigue bastando el dia que
 * alguien anada una forma de invitar a un visitante a un tenant de verdad.
 */
create or replace function app.purge_expired_demos() returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_deleted integer;
  v_users   uuid[];
begin
  -- Se recogen los usuarios de TODAS las sesiones caducadas, no solo las de los
  -- tenants que se van a borrar. Los visitantes en modo degradado cuelgan de la
  -- plantilla, que no caduca nunca: si solo se mirasen los tenants, sus cuentas
  -- se quedarian ahi para siempre. Son las que menos se notan y por eso mismo
  -- las que se acumulan.
  select coalesce(array_agg(distinct s.user_id), '{}'::uuid[])
    into v_users
    from public.demo_sessions s
   where s.user_id is not null
     and s.expires_at < now();

  delete from public.tenants
   where is_demo and expires_at is not null and expires_at < now()
     -- La plantilla no caduca nunca, pero la guarda va explicita: un
     -- `expires_at` puesto por error en la plantilla borraria la demostracion
     -- entera y no habria nada que clonar.
     and id <> '00000000-0000-4000-8000-000000000001';

  get diagnostics v_deleted = row_count;

  -- Las sesiones de los tenants borrados se fueron en cascada; estas son las que
  -- quedan, las de solo lectura sobre la plantilla.
  delete from public.demo_sessions where expires_at < now();

  -- Y sus pertenencias, que sobreviven porque la plantilla sigue viva. Sin esto,
  -- la guarda de "no le queda ninguna pertenencia" de abajo impediria para
  -- siempre borrar a estos usuarios.
  delete from public.memberships m
   where m.user_id = any(v_users)
     and exists (
       select 1 from auth.users u
        where u.id = m.user_id
          and coalesce((u.raw_app_meta_data ->> 'is_demo')::boolean, false)
     );

  delete from auth.users u
   where u.id = any(v_users)
     and coalesce((u.raw_app_meta_data ->> 'is_demo')::boolean, false)
     and not exists (select 1 from public.memberships m where m.user_id = u.id);

  return v_deleted;
end $fn$;

revoke all on function app.purge_expired_demos() from public;

-- ---------------------------------------------------------------------------
-- La capacidad cuenta sandboxes, no visitantes
-- ---------------------------------------------------------------------------

/**
 * En que modo debe operar la provision de sandboxes.
 *
 * Identica a la anterior salvo en una linea: `active_sandboxes` cuenta ahora
 * solo las sesiones de tipo `sandbox`. Las de solo lectura son una fila y una
 * cuenta, no ocupan espacio, y contarlas aqui haria que el sistema no pudiera
 * salir nunca del modo degradado — cada visitante degradado aumentaria el numero
 * que provoco la degradacion.
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
      (select count(*)::int
         from public.demo_sessions
        where expires_at > now() and kind = 'sandbox') as vivos
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
