alter table public.tenants
  add column if not exists fiscal_country varchar(2) not null default 'VE'
  check (fiscal_country in ('VE', 'US'));

create or replace function app.set_tenant_fiscal_country(
  p_tenant_id uuid,
  p_fiscal_country text
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_fiscal_country not in ('VE', 'US') then
    raise exception 'INVALID_FISCAL_COUNTRY';
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.status = 'active'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.tenants
  set fiscal_country = p_fiscal_country
  where id = p_tenant_id;
end;
$$;

revoke all on function app.set_tenant_fiscal_country(uuid, text) from public;
grant execute on function app.set_tenant_fiscal_country(uuid, text) to authenticated;
