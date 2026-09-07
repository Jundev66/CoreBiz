-- ============================================================================
-- Funciones de contexto y aislamiento multi-tenant
--
-- Este archivo es la ultima linea de defensa del producto. Si falla, un cliente ve
-- los datos de otro, y eso no es un bug que se parchea: es el final del negocio.
--
-- Ver docs/adr/005-aislamiento-multi-tenant.md
-- ============================================================================

create schema if not exists app;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEGURIDAD: `set search_path = ''` en TODA funcion SECURITY DEFINER.
--
-- Sin esto, un atacante que pueda crear objetos en un esquema que este antes en el
-- search_path puede secuestrar el nombre de una tabla y hacer que la funcion —que
-- corre con los privilegios de su creador— ejecute algo distinto de lo que dice.
-- Es escalada de privilegios. Por eso todos los nombres van cualificados por completo.
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Tenant activo en la transaccion en curso.
 *
 * Lo fija el Unit of Work con `set_config('app.tenant_id', ..., true)`.
 * El `true` final significa LOCAL A LA TRANSACCION, y es lo mas importante de todo
 * este archivo: con `false`, la variable quedaria pegada a la conexion, y Supavisor
 * (el pooler, en modo transaccion) reutiliza esa misma conexion para el siguiente
 * request, que puede ser de OTRO TENANT. Seria una fuga de datos entre clientes,
 * intermitente y visible solo bajo concurrencia.
 */
create or replace function app.current_tenant() returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

/** Rol del usuario autenticado en el tenant activo. */
create or replace function app.current_role() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
    from public.memberships m
   where m.tenant_id = app.current_tenant()
     and m.user_id = auth.uid()
     and m.status = 'active'
$$;

/**
 * Pertenencia efectiva al tenant activo.
 *
 * Comprueba tambien el estado del tenant y su expiracion, de modo que un sandbox
 * caducado deja de ser accesible EN EL ACTO, sin esperar a que el cron lo purgue.
 * La purga es higiene de espacio; esto es la medida de seguridad.
 */
create or replace function app.is_member() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
      join public.tenants t on t.id = m.tenant_id
     where m.tenant_id = app.current_tenant()
       and m.user_id = auth.uid()
       and m.status = 'active'
       and t.status <> 'suspended'
       and (t.expires_at is null or t.expires_at > now())
  )
$$;

/**
 * Puede escribir en el tenant activo.
 *
 * La lista de roles refleja WRITE_ROLES de packages/domain/src/access/role.ts.
 * Hay un test de integracion que compara ambas para que no puedan divergir.
 */
create or replace function app.can_write() returns boolean
language sql
stable
set search_path = ''
as $$
  select app.is_member()
     and app.current_role() in ('owner', 'admin', 'sales', 'warehouse')
$$;

/** Solo owner y admin: gestion de usuarios, ajustes y lectura de auditoria. */
create or replace function app.is_admin() returns boolean
language sql
stable
set search_path = ''
as $$
  select app.is_member() and app.current_role() in ('owner', 'admin')
$$;

create or replace function app.is_owner() returns boolean
language sql
stable
set search_path = ''
as $$
  select app.is_member() and app.current_role() = 'owner'
$$;

-- Estas funciones leen memberships con privilegios elevados; nadie puede
-- redefinirlas ni ejecutarlas fuera del rol autenticado.
revoke all on function app.current_role() from public;
revoke all on function app.is_member() from public;
revoke all on function app.can_write() from public;
revoke all on function app.is_admin() from public;
revoke all on function app.is_owner() from public;

-- USAGE sobre el esquema es imprescindible ANTES que cualquier EXECUTE: sin el,
-- el rol no puede ni nombrar las funciones, y todas las politicas RLS fallan con
-- "permission denied for schema app". Como las politicas se evaluan dentro de
-- cada consulta, el sintoma no es un error de permisos legible sino que deja de
-- funcionar absolutamente todo.
grant usage on schema app to authenticated;

grant execute on function app.current_tenant() to authenticated;
grant execute on function app.current_role() to authenticated;
grant execute on function app.is_member() to authenticated;
grant execute on function app.can_write() to authenticated;
grant execute on function app.is_admin() to authenticated;
grant execute on function app.is_owner() to authenticated;
