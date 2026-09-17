-- ============================================================================
-- The AI connection of each company.
--
-- One row per company: which provider answers the assistant, at which address, with which
-- model, and the provider key SEALED by the API (AES-256-GCM, bound to the tenant id). The
-- database never sees the key in clear, and the ciphertext is useless without the
-- `AI_KEY_ENCRYPTION_KEY` that only the API holds.
--
-- Its own table and not columns on `tenants`: `tenants` has column-level update grants
-- (20260912100000_publication_hardening.sql) and a key does not belong in the row every
-- screen reads.
--
-- Reading: any member, because the assistant has to know whether it is configured and how
-- to reach the provider for whoever asks. Writing: owner and admin only, like every other
-- setting that decides where company traffic goes.
-- ============================================================================

create table if not exists public.tenant_ai_settings (
  tenant_id          uuid primary key references public.tenants (id) on delete cascade,
  provider           text not null
                     check (provider in ('ollama', 'anthropic', 'gemini', 'openai_compatible')),
  base_url           text check (base_url is null or length(base_url) <= 500),
  api_key_ciphertext text check (api_key_ciphertext is null or length(api_key_ciphertext) <= 4000),
  api_key_hint       text check (api_key_hint is null or length(api_key_hint) <= 8),
  model              text not null check (length(model) between 1 and 200),
  updated_by         uuid,
  updated_at         timestamptz not null default now()
);

comment on table public.tenant_ai_settings is
  'AI provider used by the assistant. The key is sealed by the API; never stored in clear.';

alter table public.tenant_ai_settings enable row level security;
alter table public.tenant_ai_settings force row level security;

drop policy if exists tenant_ai_settings_select on public.tenant_ai_settings;
create policy tenant_ai_settings_select on public.tenant_ai_settings for select to authenticated
  using (tenant_id = app.current_tenant() and app.is_member());

drop policy if exists tenant_ai_settings_insert on public.tenant_ai_settings;
create policy tenant_ai_settings_insert on public.tenant_ai_settings for insert to authenticated
  with check (tenant_id = app.current_tenant() and app.is_admin());

-- WITH CHECK as well: without it an admin could move their row onto another company.
drop policy if exists tenant_ai_settings_update on public.tenant_ai_settings;
create policy tenant_ai_settings_update on public.tenant_ai_settings for update to authenticated
  using (tenant_id = app.current_tenant() and app.is_admin())
  with check (tenant_id = app.current_tenant() and app.is_admin());

drop policy if exists tenant_ai_settings_delete on public.tenant_ai_settings;
create policy tenant_ai_settings_delete on public.tenant_ai_settings for delete to authenticated
  using (tenant_id = app.current_tenant() and app.is_admin());

-- The demo template is read-only for end users, like every other tenant table
-- (20260912100000_publication_hardening.sql). Without it, a demo visitor acting as owner of
-- the template could connect a provider that every future sandbox would inherit.
drop trigger if exists trg_guard_demo_template on public.tenant_ai_settings;
create trigger trg_guard_demo_template before insert or update or delete on public.tenant_ai_settings
  for each row execute function app.guard_demo_template();

-- Nothing for `anon`: there is no assistant without a session.
revoke all on public.tenant_ai_settings from anon;
grant select, insert, update, delete on public.tenant_ai_settings to authenticated;
