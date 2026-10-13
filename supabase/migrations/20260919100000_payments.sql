-- ============================================================================
-- Cobros y Cuentas por Cobrar (Payments & Accounts Receivable)
--
-- Cierra el ciclo financiero de ventas. Registra el ingreso de dinero y la
-- amortizacion de notas de entrega emitidas sin valor fiscal (ADR 003).
--
-- Los documentos no se borran: anular deja rastro mediante voided_at y void_reason.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                    uuid primary key,
  tenant_id             uuid        not null references public.tenants (id) on delete cascade,

  -- Correlativo INTERNO del tenant (REC-XXXXXX). Sin valor tributario.
  number                text        not null,
  customer_id           uuid        not null
                          references public.customers (id)
                          deferrable initially deferred,

  amount_minor          bigint      not null,
  currency              text        not null,
  exchange_rate_scaled  bigint      not null,
  payment_method        text        not null,
  reference             text,
  status                text        not null,
  notes                 text,

  paid_at               timestamptz not null default now(),
  voided_at             timestamptz,
  void_reason           text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint payments_currency_check check (currency in ('USD', 'VES')),
  constraint payments_amount_check   check (amount_minor > 0),
  constraint payments_status_check   check (status in ('applied', 'voided')),
  constraint payments_void_check     check (
    (status = 'voided' and voided_at is not null and void_reason is not null)
    or (status <> 'voided' and voided_at is null and void_reason is null)
  )
);

create unique index if not exists payments_tenant_number_key
  on public.payments (tenant_id, number);

create index if not exists payments_tenant_customer_idx
  on public.payments (tenant_id, customer_id);

create index if not exists payments_tenant_paid_idx
  on public.payments (tenant_id, paid_at desc);

drop trigger if exists trg_payments_touch on public.payments;
create trigger trg_payments_touch before update on public.payments
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- payment_allocations
-- ---------------------------------------------------------------------------
create table if not exists public.payment_allocations (
  tenant_id        uuid   not null references public.tenants (id) on delete cascade,
  payment_id       uuid   not null references public.payments (id) on delete cascade,
  delivery_note_id uuid   not null
                     references public.delivery_notes (id)
                     deferrable initially deferred,
  amount_minor     bigint not null,
  created_at       timestamptz not null default now(),

  primary key (payment_id, delivery_note_id),
  constraint payment_allocations_amount_check check (amount_minor > 0)
);

create index if not exists payment_allocations_delivery_note_idx
  on public.payment_allocations (tenant_id, delivery_note_id);

-- ---------------------------------------------------------------------------
-- Politicas RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array['payments', 'payment_allocations'];
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
  end loop;
end $$;

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments for delete to authenticated
  using (false);

drop policy if exists payment_allocations_delete on public.payment_allocations;
create policy payment_allocations_delete on public.payment_allocations for delete to authenticated
  using (false);

grant select, insert, update on public.payments to authenticated;
grant select, insert, update on public.payment_allocations to authenticated;

-- ---------------------------------------------------------------------------
-- Actualizacion de app.clone_demo_tenant para clonar cobros en el sandbox
-- ---------------------------------------------------------------------------
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

  -- Cobros y sus imputaciones
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

  insert into public.demo_sessions (id, tenant_id, ip_hash, expires_at)
  values (extensions.uuid_generate_v4(), v_new, p_ip_hash, v_expiry);

  return v_new;
end $fn$;

revoke all on function app.clone_demo_tenant(uuid, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Disparador trg_guard_demo_template para proteger la plantilla de la demo
-- ---------------------------------------------------------------------------
drop trigger if exists trg_guard_demo_template on public.payments;
create trigger trg_guard_demo_template before insert or update or delete on public.payments
  for each row execute function app.guard_demo_template();

drop trigger if exists trg_guard_demo_template on public.payment_allocations;
create trigger trg_guard_demo_template before insert or update or delete on public.payment_allocations
  for each row execute function app.guard_demo_template();
