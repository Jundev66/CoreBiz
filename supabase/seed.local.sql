-- ============================================================================
-- Local-only seed. NEVER run this in production.
--
-- `supabase start` and `supabase db reset` load it right after `seed.sql` (see
-- `[db.seed]` in config.toml). The production procedure in `docs/DEPLOY.md` pastes
-- `seed.sql` alone, so nothing in this file ever reaches a public deployment.
--
-- It does the two things that make the seeded demo tenant usable for development and
-- for the E2E suite, and that would be a hole anywhere else:
--
--   1. It gives the template owner (`demo@corebiz.local`) a KNOWN password and the
--      email identity GoTrue needs to accept it. `seed.sql` creates that account with a
--      random password nobody knows and no identity, because the repository is public
--      and the account owns the template every visitor sandbox is copied from.
--
--   2. It unlocks the template. The `demo_template_locked` flag defaults to locked (see
--      the publication-hardening migration); the E2E suite signs in as that owner and
--      creates customers and notes in the demo tenant, which the lock would refuse.
--
-- Idempotent: running it twice leaves the same state.
-- ============================================================================

do $local$
declare
  v_owner uuid := '00000000-0000-4000-8000-000000000002';
begin
  update auth.users
     set encrypted_password = extensions.crypt('corebiz-demo', extensions.gen_salt('bf'))
   where id = v_owner;

  -- Without this row GoTrue does not consider email+password a sign-in method for the
  -- account: the user exists and still cannot log in.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_owner::text, v_owner,
    jsonb_build_object('sub', v_owner::text, 'email', 'demo@corebiz.local', 'email_verified', true),
    'email', now(), now() - interval '120 days', now()
  )
  on conflict (provider_id, provider) do nothing;

  insert into public.system_flags (key, value)
  values ('demo_template_locked', 'false'::jsonb)
  on conflict (key) do update set value = excluded.value;

  raise notice 'CoreBiz: local seed applied (known demo password, template unlocked).';
end
$local$;
