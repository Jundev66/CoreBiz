-- ============================================================================
-- Quien esta en MI empresa, con su correo
--
-- La pantalla de equipo necesita mostrar direcciones de correo, y esas viven en
-- `auth.users`, que gestiona Supabase. El rol `authenticated` no tiene permiso
-- de lectura sobre esa tabla, y no debe tenerlo: el `GRANT SELECT ON auth.users
-- TO authenticated` que sugiere el propio mensaje de error de Postgres daria a
-- CUALQUIER usuario del proyecto acceso al correo y al hash de contrasena de
-- TODOS los demas, incluidos los de otras empresas. Es exactamente la fuga que
-- las politicas RLS existen para evitar, abierta por la puerta de al lado.
--
-- La salida correcta es una funcion acotada: SECURITY DEFINER para poder leer
-- `auth.users`, pero devolviendo unicamente las filas de la empresa activa, y
-- solo si quien pregunta pertenece a ella.
-- ============================================================================

/**
 * Miembros de la empresa activa.
 *
 * NO acepta un identificador de tenant como parametro. Resuelve la empresa con
 * `app.current_tenant()` y la pertenencia con `app.is_member()`, de modo que no
 * hay forma de preguntarle por el equipo de otra empresa: aunque quien llame
 * pasara el identificador equivocado, no hay identificador que pasar.
 *
 * Devuelve el correo y nada mas de `auth.users`. Ni el hash de la contrasena, ni
 * los metadatos, ni las marcas de confirmacion. Lo que no sale no se filtra.
 */
create or replace function app.tenant_members()
returns table (
  user_id    uuid,
  email      text,
  role       text,
  status     text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.status, m.created_at
    from public.memberships m
    left join auth.users u on u.id = m.user_id
   where m.tenant_id = app.current_tenant()
     and app.is_member()
   order by m.created_at
$$;

revoke all on function app.tenant_members() from public;
grant execute on function app.tenant_members() to authenticated;
