create table if not exists public.document_installments (
  id                 uuid        not null primary key,
  tenant_id          uuid        not null references public.tenants (id) on delete cascade,
  document_type      text        not null,
  document_id        uuid        not null,
  installment_number integer     not null,
  frequency          text        not null,
  due_date           timestamptz not null,
  currency           text        not null,
  amount_minor       bigint      not null,
  paid_minor         bigint      not null default 0,
  status             text        not null default 'PENDING',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists document_installments_doc_num_key
  on public.document_installments (tenant_id, document_type, document_id, installment_number);

create index if not exists document_installments_tenant_doc_idx
  on public.document_installments (tenant_id, document_type, document_id);

create index if not exists document_installments_tenant_due_idx
  on public.document_installments (tenant_id, due_date);

create table if not exists public.document_payments (
  id                   uuid        not null primary key,
  tenant_id            uuid        not null references public.tenants (id) on delete cascade,
  direction            text        not null,
  document_type        text        not null,
  document_id          uuid        not null,
  installment_id       uuid        references public.document_installments (id) on delete set null,
  payment_number       text        not null,
  payment_method       text        not null,
  payment_currency     text        not null,
  payment_amount_minor bigint      not null,
  document_currency    text        not null,
  applied_amount_minor bigint      not null,
  exchange_rate_scaled bigint      not null default 100000000,
  account_id           uuid        not null references public.accounts (id) on delete restrict,
  journal_entry_id     uuid        references public.journal_entries (id) on delete set null,
  payment_date         timestamptz not null,
  reference            text,
  notes                text,
  status               text        not null default 'POSTED',
  created_at           timestamptz not null default now()
);

create index if not exists document_payments_tenant_doc_idx
  on public.document_payments (tenant_id, document_type, document_id);

create index if not exists document_payments_tenant_dir_date_idx
  on public.document_payments (tenant_id, direction, payment_date desc);

grant select, insert, update, delete on
  public.document_installments,
  public.document_payments
  to authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'document_installments',
    'document_payments'
  ];
begin
  foreach t in array tables loop
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

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using (tenant_id = app.current_tenant() and app.can_write())
        with check (tenant_id = app.current_tenant() and app.can_write())
    $f$, t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using (tenant_id = app.current_tenant() and app.can_write())
    $f$, t || '_delete', t);

    execute format('drop trigger if exists trg_guard_demo_template on public.%I', t);
    execute format($f$
      create trigger trg_guard_demo_template
        before insert or update or delete on public.%I
        for each row execute function app.guard_demo_template()
    $f$, t);
  end loop;
end;
$$;
