-- ============================================================================
-- Politicas de Row Level Security
--
-- Se generan en bucle sobre la lista de tablas con `tenant_id`. Escribirlas a mano
-- una por una es como se olvida una: el bucle garantiza que todas reciben el mismo
-- tratamiento, y el test de integracion `rls-matrix` verifica que no falta ninguna.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Politica estandar para las tablas de negocio.
--
-- FORCE ROW LEVEL SECURITY es imprescindible, no un extra: sin el, el PROPIETARIO
-- de la tabla salta sus propias politicas. Como la aplicacion podria acabar
-- conectando con un rol que resulte ser el owner, sin FORCE el aislamiento seria
-- una ilusion.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  business_tables text[] := array[
    'customers', 'products', 'stock_movements',
    'quotes', 'quote_lines',
    'delivery_notes', 'delivery_note_lines', 'payments',
    'suppliers', 'purchase_orders', 'purchase_order_lines', 'goods_receipts',
    'document_sequences', 'tenant_usage'
  ];
begin
  foreach t in array business_tables loop
    -- Se salta la tabla si aun no existe: las migraciones de modulos vienen despues.
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($f$
      create policy %I on public.%I for select to authenticated
        using (tenant_id = app.current_tenant() and app.is_member())
    $f$, t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check (tenant_id = app.current_tenant() and app.can_write())
    $f$, t || '_insert', t);

    -- El WITH CHECK del update es lo que impide "mover" una fila propia al tenant
    -- de otro cambiandole el tenant_id. Sin el, el USING dejaria pasar la escritura.
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using (tenant_id = app.current_tenant() and app.can_write())
        with check (tenant_id = app.current_tenant() and app.can_write())
    $f$, t || '_update', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Borrado: solo donde tiene sentido.
--
-- Los DOCUMENTOS no se borran nunca, se anulan. Borrar una nota de entrega dejaria
-- huecos en la numeracion correlativa y movimientos de stock sin origen: el
-- inventario dejaria de poder explicarse.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  deletable text[] := array['customers', 'products', 'suppliers', 'quote_lines',
                            'delivery_note_lines', 'purchase_order_lines'];
  immutable_docs text[] := array['quotes', 'delivery_notes', 'payments',
                                 'purchase_orders', 'goods_receipts', 'stock_movements'];
begin
  foreach t in array deletable loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using (tenant_id = app.current_tenant() and app.is_admin())
    $f$, t || '_delete', t);
  end loop;

  foreach t in array immutable_docs loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated using (false)
    $f$, t || '_delete', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tablas con reglas propias
-- ─────────────────────────────────────────────────────────────────────────────

-- tenants: se ve si eres miembro; solo owner y admin la modifican.
alter table public.tenants enable row level security;
alter table public.tenants force row level security;

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
       where m.tenant_id = tenants.id
         and m.user_id = auth.uid()
         and m.status = 'active'
    )
  );

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants for update to authenticated
  using (id = app.current_tenant() and app.is_admin())
  with check (id = app.current_tenant());

-- Crear y borrar tenants pasa por casos de uso con service_role (alta de cuenta y
-- provision del sandbox), nunca por una escritura directa del usuario.
drop policy if exists tenants_insert on public.tenants;
create policy tenants_insert on public.tenants for insert to authenticated
  with check (false);

-- memberships: cada quien ve las suyas; solo owner/admin gestionan las del tenant.
alter table public.memberships enable row level security;
alter table public.memberships force row level security;

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or (tenant_id = app.current_tenant() and app.is_member()));

drop policy if exists memberships_write on public.memberships;
create policy memberships_write on public.memberships for insert to authenticated
  with check (tenant_id = app.current_tenant() and app.is_admin());

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (tenant_id = app.current_tenant() and app.is_admin())
  with check (tenant_id = app.current_tenant() and app.is_admin());

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (tenant_id = app.current_tenant() and app.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_log: APPEND-ONLY, garantizado por GRANT y no solo por politica.
--
-- Una politica se puede sustituir con un `create policy` posterior. Revocar el
-- privilegio es mas dificil de deshacer por accidente, y un registro de auditoria
-- que se puede editar no sirve de nada.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (tenant_id = app.current_tenant() and app.is_admin());

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log for insert to authenticated
  with check (tenant_id = app.current_tenant() and app.is_member());

revoke update, delete on public.audit_log from authenticated;

-- system_flags: lectura para todos (la aplicacion consulta el modo de operacion),
-- escritura reservada a los procesos internos.
alter table public.system_flags enable row level security;
alter table public.system_flags force row level security;

drop policy if exists system_flags_select on public.system_flags;
create policy system_flags_select on public.system_flags for select to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Privilegios base
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on all tables in schema public from public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update, delete on public.audit_log from authenticated;

-- El ultimo owner de un tenant no puede degradarse ni eliminarse: dejaria la empresa
-- sin nadie capaz de gestionar usuarios, y recuperarla exigiria intervencion manual.
create or replace function app.enforce_last_owner() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining int;
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    select count(*) into remaining
      from public.memberships
     where tenant_id = old.tenant_id
       and role = 'owner'
       and status = 'active'
       and user_id <> old.user_id;

    if remaining = 0 then
      raise exception 'LAST_OWNER: un tenant necesita al menos un propietario activo'
        using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_enforce_last_owner on public.memberships;
create trigger trg_enforce_last_owner
  before update or delete on public.memberships
  for each row execute function app.enforce_last_owner();
