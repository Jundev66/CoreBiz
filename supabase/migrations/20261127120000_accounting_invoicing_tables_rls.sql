create table if not exists public.accounts (
  id              uuid primary key,
  tenant_id       uuid        not null references public.tenants (id) on delete cascade on update no action,
  code            text        not null,
  name            text        not null,
  category        text        not null,
  normal_side     text        not null,
  parent_id       uuid        references public.accounts (id) on delete restrict on update no action,
  is_reconcilable boolean     not null default false,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists accounts_tenant_code_key
  on public.accounts (tenant_id, code);
create index if not exists accounts_tenant_category_idx
  on public.accounts (tenant_id, category);

create table if not exists public.journal_entries (
  id                 uuid primary key,
  tenant_id          uuid        not null references public.tenants (id) on delete cascade on update no action,
  entry_number       bigint      not null,
  date               timestamptz not null,
  description        text        not null,
  source_type        text        not null,
  source_id          uuid,
  currency           text        not null,
  total_debit_minor  bigint      not null,
  total_credit_minor bigint      not null,
  is_locked          boolean     not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists journal_entries_tenant_entry_number_key
  on public.journal_entries (tenant_id, entry_number);
create index if not exists journal_entries_tenant_date_idx
  on public.journal_entries (tenant_id, date);
create index if not exists journal_entries_tenant_source_idx
  on public.journal_entries (tenant_id, source_type, source_id);

create table if not exists public.journal_entry_lines (
  id           uuid primary key,
  tenant_id    uuid        not null references public.tenants (id) on delete cascade on update no action,
  entry_id     uuid        not null references public.journal_entries (id) on delete cascade on update no action,
  account_id   uuid        not null references public.accounts (id) on delete restrict on update no action,
  debit_minor  bigint      not null default 0,
  credit_minor bigint      not null default 0,
  currency     text        not null,
  memo         text,
  created_at   timestamptz not null default now()
);

create index if not exists journal_entry_lines_tenant_entry_idx
  on public.journal_entry_lines (tenant_id, entry_id);
create index if not exists journal_entry_lines_tenant_account_idx
  on public.journal_entry_lines (tenant_id, account_id);

create table if not exists public.invoices (
  id              uuid primary key,
  tenant_id       uuid        not null references public.tenants (id) on delete cascade on update no action,
  customer_id     uuid        not null references public.customers (id) on delete restrict on update no action,
  document_type   text        not null,
  document_number text        not null,
  control_number  text,
  issue_date      timestamptz not null,
  due_date        timestamptz not null,
  currency        text        not null,
  subtotal_minor  bigint      not null,
  tax_minor       bigint      not null,
  igtf_minor      bigint      not null default 0,
  total_minor     bigint      not null,
  paid_minor      bigint      not null default 0,
  status          text        not null default 'DRAFT',
  idempotency_key text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists invoices_tenant_document_number_key
  on public.invoices (tenant_id, document_number);
create index if not exists invoices_tenant_customer_idx
  on public.invoices (tenant_id, customer_id);
create index if not exists invoices_tenant_issue_date_idx
  on public.invoices (tenant_id, issue_date);
create index if not exists invoices_tenant_idempotency_idx
  on public.invoices (tenant_id, idempotency_key);

create table if not exists public.invoice_lines (
  id               uuid primary key,
  tenant_id        uuid        not null references public.tenants (id) on delete cascade on update no action,
  invoice_id       uuid        not null references public.invoices (id) on delete cascade on update no action,
  product_id       uuid        references public.products (id) on delete set null on update no action,
  description      text        not null,
  quantity_scaled  bigint      not null,
  unit_price_minor bigint      not null,
  tax_rate_bp      integer     not null,
  subtotal_minor   bigint      not null,
  tax_minor        bigint      not null,
  total_minor      bigint      not null,
  created_at       timestamptz not null default now()
);

create index if not exists invoice_lines_tenant_invoice_idx
  on public.invoice_lines (tenant_id, invoice_id);

create table if not exists public.fiscal_sequences (
  id             uuid primary key,
  tenant_id      uuid        not null references public.tenants (id) on delete cascade on update no action,
  document_type  text        not null,
  prefix         text        not null default '',
  current_number bigint      not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists fiscal_sequences_tenant_type_prefix_key
  on public.fiscal_sequences (tenant_id, document_type, prefix);

grant select, insert, update, delete on
  public.accounts,
  public.journal_entries,
  public.journal_entry_lines,
  public.invoices,
  public.invoice_lines,
  public.fiscal_sequences
to authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'accounts',
    'journal_entries',
    'journal_entry_lines',
    'invoices',
    'invoice_lines',
    'fiscal_sequences'
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
