-- ============================================================================
-- Hardening from the 2026-09-15 security review.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- `system_flags` is read-only for end users by PRIVILEGE, not only by missing policy.
--
-- The base grant gave `authenticated` insert, update and delete on every public table, and
-- this one was protected only because no write policy exists. The demo-template lock reads
-- its flag from here: a single permissive policy added later would have opened it.
--
-- Considered and NOT done here: requiring `email_confirmed_at` in `app.accept_invitation`.
-- With "Confirm email" off, Supabase auto-confirms at signup and fills that column anyway,
-- so the check would stop nothing the dashboard setting does not already stop. That setting
-- is on the deployment checklist instead (docs/DEPLOY.md).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.system_flags from authenticated;
