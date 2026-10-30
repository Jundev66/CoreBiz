create table if not exists public.pos_registers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants (id) on delete cascade,
  name        text        not null,
  code        text        not null,
  status      text        not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint pos_registers_code_check check (code ~ '^[A-Z0-9_-]{2,20}$'),
  constraint pos_registers_status_check check (status in ('active', 'inactive'))
);

create unique index if not exists pos_registers_tenant_code_key
  on public.pos_registers (tenant_id, code);
create index if not exists pos_registers_tenant_idx
  on public.pos_registers (tenant_id);

create table if not exists public.pos_devices (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid        not null references public.tenants (id) on delete cascade,
  installation_id   uuid        not null,
  name              text        not null,
  platform          text,
  browser           text,
  status            text        not null default 'pending',
  device_token_hash text,
  registered_at     timestamptz not null default now(),
  last_seen_at      timestamptz,

  constraint pos_devices_status_check check (status in ('pending', 'active', 'revoked'))
);

create unique index if not exists pos_devices_tenant_installation_key
  on public.pos_devices (tenant_id, installation_id);
create index if not exists pos_devices_tenant_idx
  on public.pos_devices (tenant_id);

create table if not exists public.pos_register_assignments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants (id) on delete cascade,
  register_id      uuid        not null references public.pos_registers (id) on delete cascade,
  device_id        uuid        not null references public.pos_devices (id) on delete cascade,
  assigned_at      timestamptz not null default now(),
  revoked_at       timestamptz,
  assigned_by      uuid        not null references auth.users (id) on delete restrict
);

create index if not exists pos_register_assignments_active_idx
  on public.pos_register_assignments (tenant_id, register_id)
  where revoked_at is null;

create table if not exists public.pos_cash_shifts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants (id) on delete cascade,
  register_id          uuid        not null references public.pos_registers (id) on delete restrict,
  device_id            uuid        not null references public.pos_devices (id) on delete restrict,
  opened_by_user_id    uuid        not null references auth.users (id) on delete restrict,
  opened_at            timestamptz not null,
  initial_float_minor  bigint      not null,
  status               text        not null default 'open',
  closed_by_user_id    uuid        references auth.users (id) on delete restrict,
  closed_at            timestamptz,
  declared_cash_minor  bigint,
  system_cash_minor    bigint,
  cash_variance_minor  bigint,
  notes                text,
  created_at           timestamptz not null default now(),

  constraint pos_cash_shifts_float_check check (initial_float_minor >= 0),
  constraint pos_cash_shifts_status_check check (status in ('open', 'closed', 'audited')),
  constraint pos_cash_shifts_close_check check (
    (status = 'open' and closed_at is null and closed_by_user_id is null)
    or (status in ('closed', 'audited') and closed_at is not null and closed_by_user_id is not null)
  )
);

create index if not exists pos_cash_shifts_tenant_register_status_idx
  on public.pos_cash_shifts (tenant_id, register_id, status);

create table if not exists public.pos_cash_movements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants (id) on delete cascade,
  shift_id       uuid        not null references public.pos_cash_shifts (id) on delete cascade,
  movement_type  text        not null,
  amount_minor   bigint      not null,
  reason         text        not null,
  occurred_at    timestamptz not null,
  created_at     timestamptz not null default now(),

  constraint pos_cash_movements_type_check check (movement_type in ('cash_in', 'cash_out')),
  constraint pos_cash_movements_amount_check check (amount_minor > 0)
);

create index if not exists pos_cash_movements_tenant_shift_idx
  on public.pos_cash_movements (tenant_id, shift_id);

create table if not exists public.pos_sales (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants (id) on delete cascade,
  register_id      uuid        not null references public.pos_registers (id) on delete restrict,
  device_id        uuid        not null references public.pos_devices (id) on delete restrict,
  shift_id         uuid        not null references public.pos_cash_shifts (id) on delete restrict,
  cashier_user_id  uuid        not null references auth.users (id) on delete restrict,
  operation_id     uuid        not null,
  ticket_number    text        not null,
  status           text        not null default 'completed',
  subtotal_minor   bigint      not null,
  tax_minor        bigint      not null default 0,
  total_minor      bigint      not null,
  payment_method   text        not null,
  occurred_at      timestamptz not null,
  received_at      timestamptz not null default now(),
  posted_at        timestamptz not null default now(),

  constraint pos_sales_status_check check (status in ('completed', 'voided')),
  constraint pos_sales_payment_check check (payment_method in ('cash', 'card', 'transfer', 'split'))
);

create unique index if not exists pos_sales_tenant_operation_key
  on public.pos_sales (tenant_id, operation_id);
create index if not exists pos_sales_tenant_occurred_idx
  on public.pos_sales (tenant_id, register_id, occurred_at desc);

create table if not exists public.pos_sale_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid        not null references public.tenants (id) on delete cascade,
  sale_id           uuid        not null references public.pos_sales (id) on delete cascade,
  product_id        uuid        references public.products (id) on delete set null,
  temporary_name    text,
  barcode_scanned   text,
  quantity          bigint      not null,
  unit_price_minor  bigint      not null,
  line_total_minor  bigint      not null,
  created_at        timestamptz not null default now(),

  constraint pos_sale_lines_quantity_check check (quantity > 0)
);

create index if not exists pos_sale_lines_tenant_sale_idx
  on public.pos_sale_lines (tenant_id, sale_id);

create table if not exists public.pos_sync_operations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants (id) on delete cascade,
  operation_id    uuid        not null,
  device_id       uuid        not null references public.pos_devices (id) on delete cascade,
  operation_type  text        not null,
  sequence        bigint      not null,
  payload_hash    text        not null,
  status          text        not null default 'received',
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  error_message   text,

  constraint pos_sync_operations_status_check check (status in ('received', 'processed', 'failed'))
);

create unique index if not exists pos_sync_operations_tenant_operation_key
  on public.pos_sync_operations (tenant_id, operation_id);
create unique index if not exists pos_sync_operations_tenant_device_seq_key
  on public.pos_sync_operations (tenant_id, device_id, sequence);
create index if not exists pos_sync_operations_tenant_status_idx
  on public.pos_sync_operations (tenant_id, status);

create table if not exists public.inventory_conflicts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid        not null references public.tenants (id) on delete cascade,
  product_id         uuid        references public.products (id) on delete set null,
  conflict_type      text        not null,
  status             text        not null default 'open',
  detected_at        timestamptz not null default now(),
  stock_before       bigint      not null default 0,
  quantity_attempted bigint      not null default 0,
  stock_after        bigint      not null default 0,
  shortage_quantity  bigint      not null default 0,
  assigned_to        uuid        references auth.users (id) on delete set null,
  resolution_type    text,
  resolution_notes   text,
  resolved_by        uuid        references auth.users (id) on delete set null,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),

  constraint inventory_conflicts_type_check check (conflict_type in ('negative_stock', 'uncataloged_product')),
  constraint inventory_conflicts_status_check check (status in ('open', 'investigating', 'resolved', 'dismissed'))
);

create index if not exists inventory_conflicts_tenant_status_idx
  on public.inventory_conflicts (tenant_id, status, product_id);

create table if not exists public.inventory_conflict_movements (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid        not null references public.tenants (id) on delete cascade,
  conflict_id           uuid        not null references public.inventory_conflicts (id) on delete cascade,
  stock_movement_id     uuid,
  sale_id               uuid        references public.pos_sales (id) on delete set null,
  relation_type         text        not null,
  created_at            timestamptz not null default now(),

  constraint conflict_movements_relation_check check (relation_type in ('cause', 'context', 'resolution'))
);

create index if not exists conflict_movements_tenant_conflict_idx
  on public.inventory_conflict_movements (tenant_id, conflict_id);

do $$
declare
  t text;
  tables text[] := array[
    'pos_registers',
    'pos_devices',
    'pos_register_assignments',
    'pos_cash_shifts',
    'pos_cash_movements',
    'pos_sales',
    'pos_sale_lines',
    'pos_sync_operations',
    'inventory_conflicts',
    'inventory_conflict_movements'
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
  end loop;
end;
$$;
