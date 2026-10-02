-- ============================================================================
-- Recopilación de leads de demostración
--
-- Guarda de forma segura el correo y datos de contacto de quienes prueban
-- la demo en vivo para prospección comercial y seguimiento sin fricciones.
-- ============================================================================

create table if not exists public.demo_leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  company     text,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

create index if not exists demo_leads_created_idx on public.demo_leads (created_at desc);
create index if not exists demo_leads_email_idx on public.demo_leads (email);

alter table public.demo_leads enable row level security;
alter table public.demo_leads force row level security;
revoke all on public.demo_leads from anon, authenticated;

/**
 * Registra un lead de demo de forma segura desde la API.
 */
create or replace function app.record_demo_lead(
  p_email text,
  p_name text default null,
  p_company text default null,
  p_ip_hash text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_email is not null and trim(p_email) <> '' then
    insert into public.demo_leads (email, name, company, ip_hash)
    values (trim(lower(p_email)), nullif(trim(p_name), ''), nullif(trim(p_company), ''), p_ip_hash);
  end if;
end;
$$;

revoke all on function app.record_demo_lead(text, text, text, text) from public, anon, authenticated;
grant execute on function app.record_demo_lead(text, text, text, text) to corebiz_api;
