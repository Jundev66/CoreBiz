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

-- ─────────────────────────────────────────────────────────────────────────
-- Proteccion de la plantilla demo contra escrituras directas
-- ─────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_guard_demo_template on public.pos_registers;
create trigger trg_guard_demo_template before insert or update or delete on public.pos_registers
  for each row execute function app.guard_demo_template();

drop trigger if exists trg_guard_demo_template on public.pos_cash_shifts;
create trigger trg_guard_demo_template before insert or update or delete on public.pos_cash_shifts
  for each row execute function app.guard_demo_template();

drop trigger if exists trg_guard_demo_template on public.pos_sales;
create trigger trg_guard_demo_template before insert or update or delete on public.pos_sales
  for each row execute function app.guard_demo_template();

-- ─────────────────────────────────────────────────────────────────────────
-- Actualizacion de app.clone_demo_tenant para clonar cajas POS en sandboxes
-- ─────────────────────────────────────────────────────────────────────────
create or replace function app.clone_demo_tenant(
  p_template  uuid,
  p_ip_hash   text default null,
  p_ttl_hours integer default 24
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_new    uuid := extensions.uuid_generate_v4();
  v_expiry timestamptz := now() + make_interval(hours => p_ttl_hours);
begin
  if not exists (select 1 from public.tenants where id = p_template and is_demo) then
    raise exception 'NOT_A_DEMO_TEMPLATE: la plantilla no existe o no es de demostracion'
      using errcode = 'P0001';
  end if;

  insert into public.tenants (
    id, slug, name, plan_code, status, is_demo, expires_at,
    base_currency, exchange_rate_scaled, exchange_rate_at,
    tax_label, tax_rate_bp, settings
  )
  select
    v_new,
    'demo-' || substr(v_new::text, 1, 8),
    t.name,
    t.plan_code, t.status, true, v_expiry,
    t.base_currency, t.exchange_rate_scaled, t.exchange_rate_at,
    t.tax_label, t.tax_rate_bp, t.settings
  from public.tenants t
  where t.id = p_template;

  insert into public.memberships (tenant_id, user_id, role, status, created_at)
  select v_new, m.user_id, m.role, m.status, m.created_at
    from public.memberships m
   where m.tenant_id = p_template;

  insert into public.customers (
    id, tenant_id, code, name, tax_id, email, phone, address,
    credit_limit_minor, credit_limit_currency, archived_at, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, c.id::text), v_new,
    c.code, c.name, c.tax_id, c.email, c.phone, c.address,
    c.credit_limit_minor, c.credit_limit_currency, c.archived_at, c.created_at
  from public.customers c
  where c.tenant_id = p_template;

  insert into public.products (
    id, tenant_id, sku, name, description, unit,
    price_minor, price_currency, cost_minor, cost_currency,
    taxable, track_stock, on_hand, min_stock, stock_policy, archived_at, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, p.id::text), v_new,
    p.sku, p.name, p.description, p.unit,
    p.price_minor, p.price_currency, p.cost_minor, p.cost_currency,
    p.taxable, p.track_stock, p.on_hand, p.min_stock, p.stock_policy,
    p.archived_at, p.created_at
  from public.products p
  where p.tenant_id = p_template;

  insert into public.stock_movements (
    id, tenant_id, product_id, kind, quantity, balance_after,
    ref_type, ref_id, note, occurred_at, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, sm.id::text), v_new,
    extensions.uuid_generate_v5(v_new, sm.product_id::text),
    sm.kind, sm.quantity, sm.balance_after,
    sm.ref_type,
    case
      when sm.ref_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then extensions.uuid_generate_v5(v_new, sm.ref_id)::text
      else sm.ref_id
    end,
    sm.note, sm.occurred_at, sm.created_at
  from public.stock_movements sm
  where sm.tenant_id = p_template;

  insert into public.delivery_notes (
    id, tenant_id, number, customer_id, quote_id, status, currency,
    exchange_rate_scaled, exchange_rate_from, exchange_rate_to, exchange_rate_at,
    tax_label_snapshot, tax_rate_bp_snapshot,
    subtotal_minor, tax_minor, total_minor, total_secondary_minor,
    issued_at, issued_by, delivered_at, received_by, voided_at, void_reason,
    notes, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, dn.id::text), v_new,
    dn.number,
    extensions.uuid_generate_v5(v_new, dn.customer_id::text),
    null,
    dn.status, dn.currency,
    dn.exchange_rate_scaled, dn.exchange_rate_from, dn.exchange_rate_to, dn.exchange_rate_at,
    dn.tax_label_snapshot, dn.tax_rate_bp_snapshot,
    dn.subtotal_minor, dn.tax_minor, dn.total_minor, dn.total_secondary_minor,
    dn.issued_at, dn.issued_by, dn.delivered_at, dn.received_by,
    dn.voided_at, dn.void_reason, dn.notes, dn.created_at
  from public.delivery_notes dn
  where dn.tenant_id = p_template;

  insert into public.delivery_note_lines (
    tenant_id, delivery_note_id, line_no, product_id,
    description_snapshot, unit_snapshot,
    quantity, unit_price_minor, discount_bp, taxable, line_total_minor
  )
  select
    v_new,
    extensions.uuid_generate_v5(v_new, l.delivery_note_id::text),
    l.line_no,
    extensions.uuid_generate_v5(v_new, l.product_id::text),
    l.description_snapshot, l.unit_snapshot,
    l.quantity, l.unit_price_minor, l.discount_bp, l.taxable, l.line_total_minor
  from public.delivery_note_lines l
  where l.tenant_id = p_template;

  insert into public.suppliers (
    id, tenant_id, code, name, tax_id, email, phone, contact_name, notes,
    archived_at, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, s.id::text), v_new,
    s.code, s.name, s.tax_id, s.email, s.phone, s.contact_name, s.notes,
    s.archived_at, s.created_at
  from public.suppliers s
  where s.tenant_id = p_template;

  insert into public.goods_receipts (
    id, tenant_id, number, supplier_id, purchase_order_id, status, currency,
    total_minor, supplier_reference, notes,
    received_at, received_by, voided_at, void_reason, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, g.id::text), v_new,
    g.number,
    extensions.uuid_generate_v5(v_new, g.supplier_id::text),
    null,
    g.status, g.currency, g.total_minor, g.supplier_reference, g.notes,
    g.received_at, g.received_by, g.voided_at, g.void_reason, g.created_at
  from public.goods_receipts g
  where g.tenant_id = p_template;

  insert into public.goods_receipt_lines (
    tenant_id, goods_receipt_id, line_no, product_id,
    description_snapshot, unit_snapshot, quantity, unit_cost_minor, line_total_minor
  )
  select
    v_new,
    extensions.uuid_generate_v5(v_new, l.goods_receipt_id::text),
    l.line_no,
    extensions.uuid_generate_v5(v_new, l.product_id::text),
    l.description_snapshot, l.unit_snapshot,
    l.quantity, l.unit_cost_minor, l.line_total_minor
  from public.goods_receipt_lines l
  where l.tenant_id = p_template;

  insert into public.payments (
    id, tenant_id, number, customer_id, amount_minor, currency,
    exchange_rate_scaled, payment_method, reference, status, notes,
    paid_at, voided_at, void_reason, created_at
  )
  select
    extensions.uuid_generate_v5(v_new, p.id::text), v_new,
    p.number,
    extensions.uuid_generate_v5(v_new, p.customer_id::text),
    p.amount_minor, p.currency,
    p.exchange_rate_scaled, p.payment_method, p.reference, p.status, p.notes,
    p.paid_at, p.voided_at, p.void_reason, p.created_at
  from public.payments p
  where p.tenant_id = p_template;

  insert into public.payment_allocations (
    tenant_id, payment_id, delivery_note_id, amount_minor, created_at
  )
  select
    v_new,
    extensions.uuid_generate_v5(v_new, pa.payment_id::text),
    extensions.uuid_generate_v5(v_new, pa.delivery_note_id::text),
    pa.amount_minor, pa.created_at
  from public.payment_allocations pa
  where pa.tenant_id = p_template;

  insert into public.document_sequences (tenant_id, doc_type, period, prefix, next_number, padding)
  select v_new, d.doc_type, d.period, d.prefix, d.next_number, d.padding
    from public.document_sequences d
   where d.tenant_id = p_template;

  insert into public.tenant_usage (tenant_id, resource, period, count)
  select v_new, u.resource, u.period, u.count
    from public.tenant_usage u
   where u.tenant_id = p_template;

  insert into public.pos_registers (
    id, tenant_id, code, name, status, created_at, updated_at
  )
  select
    extensions.uuid_generate_v5(v_new, r.id::text), v_new,
    r.code, r.name, r.status, r.created_at, r.updated_at
  from public.pos_registers r
  where r.tenant_id = p_template;

  insert into public.demo_sessions (id, tenant_id, ip_hash, expires_at)
  values (extensions.uuid_generate_v4(), v_new, p_ip_hash, v_expiry);

  return v_new;
end $fn$;

revoke all on function app.clone_demo_tenant(uuid, text, integer) from public, anon, authenticated;
