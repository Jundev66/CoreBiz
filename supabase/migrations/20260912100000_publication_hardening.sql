-- ============================================================================
-- Publication hardening.
--
-- Written before the repository went public, after an audit of what an attacker who
-- reads the code could use. Three independent blocks; each says what it closes.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The demo template is read-only for end users.
--
-- Every visitor sandbox is a copy of tenant 00000000-0000-4000-8000-000000000001, and
-- degraded visitors read it directly. Whoever can write to it writes into every future
-- sandbox. Its owner account used to ship with a password published in `seed.sql`; the
-- seed no longer does that, and this lock does not depend on it anyway: not even a
-- genuine owner session can change the template while it is locked.
--
-- Only end-user roles are stopped. The seed, migrations and the SECURITY DEFINER
-- functions that clone the template and add degraded viewers run as the schema owner,
-- so they keep working. Local development unlocks it in `supabase/seed.local.sql`,
-- because the E2E suite writes into the demo tenant.
--
-- Locked by DEFAULT: a production database that never ran the local seed is locked
-- without anyone having to remember a step.
-- ---------------------------------------------------------------------------
insert into public.system_flags (key, value)
values ('demo_template_locked', 'true'::jsonb)
on conflict (key) do nothing;

create or replace function app.demo_template_locked() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select f.value = 'true'::jsonb
       from public.system_flags f
      where f.key = 'demo_template_locked'),
    true
  )
$$;

revoke all on function app.demo_template_locked() from public;
grant execute on function app.demo_template_locked() to authenticated;

-- Deliberately NOT security definer: `current_user` must be the role running the
-- statement. Inside a definer function (clone, provisioning) that is the owner, which is
-- exactly the path that must stay open.
create or replace function app.guard_demo_template() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_template constant uuid := '00000000-0000-4000-8000-000000000001';
  v_column   text := case when tg_table_name = 'tenants' then 'id' else 'tenant_id' end;
  v_new      uuid;
  v_old      uuid;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op <> 'DELETE' then
      v_new := (to_jsonb(new) ->> v_column)::uuid;
    end if;
    if tg_op <> 'INSERT' then
      v_old := (to_jsonb(old) ->> v_column)::uuid;
    end if;

    -- Nested on purpose: the flag lookup only happens for rows of the template.
    if v_new is not distinct from c_template or v_old is not distinct from c_template then
      if app.demo_template_locked() then
        raise exception 'DEMO_TEMPLATE_LOCKED: the demo template is read-only'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

-- Every table that holds tenant data, plus `tenants` itself. The integration test
-- `publication-hardening` compares this against the catalogue, so a new tenant table
-- without the trigger fails the build.
do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'memberships', 'invitations', 'customers', 'products', 'stock_movements',
    'delivery_notes', 'delivery_note_lines', 'document_sequences', 'tenant_usage',
    'suppliers', 'goods_receipts', 'goods_receipt_lines', 'audit_log', 'demo_sessions'
  ] loop
    execute format('drop trigger if exists trg_guard_demo_template on public.%I', t);
    execute format(
      'create trigger trg_guard_demo_template before insert or update or delete on public.%I '
      'for each row execute function app.guard_demo_template()',
      t
    );
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- 2. Admins cannot take or remove ownership, and cannot rewrite what the company is.
--
-- The use cases already refused both. Row-level security did not: `memberships` let an
-- admin write `role = 'owner'` or demote an owner, and `tenants_update` let an admin
-- change any column, `plan_code`, `is_demo`, `status` and `expires_at` included. Today
-- only the API sets the tenant context, so it was not reachable — but a policy that is
-- looser than the rule it backs is a rule waiting for a second entry point.
-- ---------------------------------------------------------------------------
drop policy if exists memberships_write on public.memberships;
create policy memberships_write on public.memberships for insert to authenticated
  with check (
    tenant_id = app.current_tenant() and app.is_admin()
    and (role <> 'owner' or app.is_owner())
  );

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (
    tenant_id = app.current_tenant() and app.is_admin()
    and (role <> 'owner' or app.is_owner())
  )
  with check (
    tenant_id = app.current_tenant() and app.is_admin()
    and (role <> 'owner' or app.is_owner())
  );

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    tenant_id = app.current_tenant() and app.is_admin()
    and (role <> 'owner' or app.is_owner())
  );

-- Column privileges, because a policy cannot restrict columns. These are exactly the
-- fields `PrismaTenantSettingsRepository.update` writes; everything else about a company
-- changes only through SECURITY DEFINER functions.
revoke update on public.tenants from authenticated;
grant update (name, tax_label, tax_rate_bp, base_currency, exchange_rate_scaled, exchange_rate_at)
  on public.tenants to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Platform functions are not callable by end users.
--
-- These were revoked from PUBLIC only. That is enough while no default privileges grant
-- EXECUTE to the Supabase roles and the `app`/`security` schemas stay out of the REST
-- API — two conditions this repository does not control. Stating it explicitly costs
-- nothing. `security.rate_limit_hit` loses its grant too: the only caller is the API,
-- connected as the platform role, and a caller able to pick bucket, limit and window
-- could pre-fill other people's counters and lock them out.
-- ---------------------------------------------------------------------------
revoke all on function app.clone_demo_tenant(uuid, text, integer) from anon, authenticated;
revoke all on function app.purge_expired_demos() from anon, authenticated;
revoke all on function app.demo_capacity(bigint) from anon, authenticated;
revoke all on function app.release_expired_invitations() from anon, authenticated;
revoke all on function security.purge_rate_limits(interval) from anon, authenticated;
revoke all on function security.rate_limit_hit(text, integer, integer) from anon, authenticated;
