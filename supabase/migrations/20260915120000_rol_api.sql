-- ============================================================================
-- The API connects with its own role, which cannot bypass row-level security.
--
-- Until now the API connected as `postgres`, which has BYPASSRLS. Isolation held only
-- because every query ran inside a transaction that lowers the role to `authenticated`
-- (`withTenant`, `readOnly`, `asUser`). One `prisma.` written where `tx.` was meant would
-- have been a silent read across companies, and a leaked `DATABASE_URL` meant the whole
-- database, `auth.users` included.
--
-- `corebiz_api` can do exactly three things:
--   1. Become `authenticated` inside a transaction, where the policies apply.
--   2. Run the platform functions the API calls, all SECURITY DEFINER and scoped.
--   3. Nothing else: outside a transaction it sees no business row.
--
-- The password is NOT here. The repository is public: it is set per environment
-- (`supabase/seed.local.sql` locally, by hand in production — see docs/DEPLOY.md).
-- `postgres` stays for migrations only.
-- ============================================================================

-- Created with the defaults that matter here — no SUPERUSER, no BYPASSRLS, no CREATEROLE —
-- and nothing more. Stating them in an `alter role` is not possible: on Supabase `postgres`
-- is not a superuser, and only a superuser may name those attributes.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'corebiz_api') then
    create role corebiz_api login noinherit;
  end if;
end $$;

-- Membership in `authenticated` is what lets `set_config('role', 'authenticated', true)`
-- work inside a transaction. NOINHERIT keeps its privileges out of reach until then.
grant authenticated to corebiz_api;

grant usage on schema app to corebiz_api;
grant usage on schema security to corebiz_api;


-- ---------------------------------------------------------------------------
-- The two reads the API made straight against tables, as bounded functions.
--
-- As `postgres` they read `demo_sessions` and `tenants` bypassing RLS. Without that
-- privilege they would return nothing, so the demo quotas would never trip. Each function
-- answers one question and returns a number or a boolean, never rows.
-- ---------------------------------------------------------------------------

/**
 * Demo sessions of one kind created in the last `p_since_seconds`.
 *
 * `p_any_origin` true counts every origin. False counts only `p_ip_hash`, and a null hash
 * counts the rows stored without one (`is not distinct from`), which is what the API asked.
 */
create or replace function app.count_demo_sessions(
  p_kind          text,
  p_since_seconds integer,
  p_any_origin    boolean default true,
  p_ip_hash       text default null
) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.demo_sessions
   where kind = p_kind
     and created_at > now() - make_interval(secs => p_since_seconds)
     and (p_any_origin or ip_hash is not distinct from p_ip_hash)
$$;

/** Whether a demo tenant exists and has not expired. */
create or replace function app.demo_sandbox_is_alive(p_tenant uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.tenants
     where id = p_tenant
       and is_demo
       and (expires_at is null or expires_at > now())
  )
$$;

revoke all on function app.count_demo_sessions(text, integer, boolean, text) from public, anon, authenticated;
revoke all on function app.demo_sandbox_is_alive(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Exactly the platform functions the API calls. Nothing else.
-- ---------------------------------------------------------------------------
grant execute on function app.count_demo_sessions(text, integer, boolean, text) to corebiz_api;
grant execute on function app.demo_sandbox_is_alive(uuid) to corebiz_api;
grant execute on function app.demo_capacity(bigint) to corebiz_api;
grant execute on function app.provision_demo_session(uuid, text, text, text, integer, boolean) to corebiz_api;
grant execute on function app.purge_expired_demos() to corebiz_api;
grant execute on function app.release_expired_invitations() to corebiz_api;
grant execute on function security.rate_limit_hit(text, integer, integer) to corebiz_api;
grant execute on function security.purge_rate_limits(interval) to corebiz_api;
