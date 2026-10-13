-- ============================================================================
-- Auto-destrucción inmediata de Sandbox de Demostración
--
-- Permite al visitante purgar de forma voluntaria, inmediata y total su copia de
-- demostración, sus configuraciones de IA (evitando cualquier retención de credenciales)
-- y su usuario efímero en Auth, sin tener que esperar a que expire el TTL.
-- ============================================================================

create or replace function app.destroy_demo_session(
  p_tenant_id uuid,
  p_user_id   uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_is_demo boolean := false;
  v_expires timestamptz;
begin
  -- Solo se permite destruir tenants marcados como demostración que no sean la plantilla fija.
  select is_demo, expires_at into v_is_demo, v_expires
    from public.tenants
   where id = p_tenant_id;

  if not v_is_demo or p_tenant_id = '00000000-0000-4000-8000-000000000001'::uuid then
    return false;
  end if;

  -- 1. Eliminar sesiones asociadas de demostración
  delete from public.demo_sessions
   where tenant_id = p_tenant_id or user_id = p_user_id;

  -- 2. Eliminar tenant (esto cascada en cascada todas las tablas transaccionales y tenant_ai_settings)
  delete from public.tenants
   where id = p_tenant_id;

  -- 3. Eliminar pertenencias residuales si las hubiera
  delete from public.memberships
   where user_id = p_user_id;

  -- 4. Eliminar el usuario efímero en auth.users si es una cuenta de demostración
  delete from auth.users
   where id = p_user_id
     and (
       coalesce((raw_app_meta_data ->> 'is_demo')::boolean, false) = true
       or email like 'demo-%@corebiz.demo'
     );

  return true;
end $fn$;

revoke all on function app.destroy_demo_session(uuid, uuid) from public, anon, authenticated;
