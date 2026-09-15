-- ============================================================================
-- Faster navigation on the database side (2026-09-15 performance review).
--
-- Two costs every screen paid, neither of which bought any isolation:
--
--   1. The API resolved WHO is acting in two transactions per request — memberships, then
--      the active company's profile — before running the query the screen asked for.
--   2. Every row-level policy called `app.is_member()` (and friends) bare. They are
--      SECURITY DEFINER, so Postgres cannot inline them, and a bare call in a policy is
--      evaluated PER ROW. Wrapped in a scalar subquery they become an InitPlan: evaluated
--      once per statement, same answer, because nothing they read changes mid-statement.
--
-- The policies keep their exact logic. Only the call form changes, and the RLS matrix
-- integration tests are what prove it.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Memberships and the profile of each company, in one call.
--
-- Same rows and conditions as `app.my_memberships()`, plus the columns the API used to
-- read in a second transaction. `my_memberships()` stays: the integration tests and any
-- other caller keep working.
-- ---------------------------------------------------------------------------
create or replace function app.my_session_context()
returns table (
  tenant_id            uuid,
  slug                 text,
  name                 text,
  role                 text,
  plan_code            text,
  is_demo              boolean,
  status               text,
  expires_at           timestamptz,
  tax_label            text,
  tax_rate_bp          integer,
  base_currency        text,
  exchange_rate_scaled bigint,
  exchange_rate_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.slug, t.name, m.role, t.plan_code, t.is_demo, t.status,
         t.expires_at, t.tax_label, t.tax_rate_bp, t.base_currency,
         t.exchange_rate_scaled, t.exchange_rate_at
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = auth.uid()
     and m.status = 'active'
     and t.status <> 'suspended'
     and (t.expires_at is null or t.expires_at > now())
   order by t.name
$$;

revoke all on function app.my_session_context() from public;
revoke all on function app.my_session_context() from anon;
grant execute on function app.my_session_context() to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Standard policies on every company table, evaluated once per statement.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables text[] := array[
    'customers', 'products', 'stock_movements',
    'quotes', 'quote_lines',
    'delivery_notes', 'delivery_note_lines', 'payments',
    'suppliers', 'purchase_orders', 'purchase_order_lines',
    'goods_receipts', 'goods_receipt_lines',
    'document_sequences', 'tenant_usage'
  ];
  deletable text[] := array[
    'customers', 'products', 'suppliers', 'quote_lines',
    'delivery_note_lines', 'purchase_order_lines', 'goods_receipt_lines'
  ];
begin
  foreach t in array tenant_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($f$
      create policy %I on public.%I for select to authenticated
        using (tenant_id = (select app.current_tenant()) and (select app.is_member()))
    $f$, t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check (tenant_id = (select app.current_tenant()) and (select app.can_write()))
    $f$, t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using (tenant_id = (select app.current_tenant()) and (select app.can_write()))
        with check (tenant_id = (select app.current_tenant()) and (select app.can_write()))
    $f$, t || '_update', t);
  end loop;

  -- Only the delete policies that call a helper. The `using (false)` ones on documents
  -- evaluate nothing and are left as they are.
  foreach t in array deletable loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using (tenant_id = (select app.current_tenant()) and (select app.is_admin()))
    $f$, t || '_delete', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Tables with their own rules. Same logic, subquery form.
-- ---------------------------------------------------------------------------

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
       where m.tenant_id = tenants.id
         and m.user_id = (select auth.uid())
         and m.status = 'active'
    )
  );

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants for update to authenticated
  using (id = (select app.current_tenant()) and (select app.is_admin()))
  with check (id = (select app.current_tenant()));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or (tenant_id = (select app.current_tenant()) and (select app.is_member()))
  );

-- The owner rules from 20260912100000_publication_hardening.sql, unchanged.
drop policy if exists memberships_write on public.memberships;
create policy memberships_write on public.memberships for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant()) and (select app.is_admin())
    and (role <> 'owner' or (select app.is_owner()))
  );

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (
    tenant_id = (select app.current_tenant()) and (select app.is_admin())
    and (role <> 'owner' or (select app.is_owner()))
  )
  with check (
    tenant_id = (select app.current_tenant()) and (select app.is_admin())
    and (role <> 'owner' or (select app.is_owner()))
  );

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    tenant_id = (select app.current_tenant()) and (select app.is_admin())
    and (role <> 'owner' or (select app.is_owner()))
  );

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (tenant_id = (select app.current_tenant()) and (select app.is_admin()));

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log for insert to authenticated
  with check (tenant_id = (select app.current_tenant()) and (select app.is_member()));

drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (tenant_id = (select app.current_tenant()) and (select app.is_admin()));

drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations for insert to authenticated
  with check (tenant_id = (select app.current_tenant()) and (select app.is_admin()));

drop policy if exists invitations_update on public.invitations;
create policy invitations_update on public.invitations for update to authenticated
  using (tenant_id = (select app.current_tenant()) and (select app.is_admin()))
  with check (tenant_id = (select app.current_tenant()) and (select app.is_admin()));
