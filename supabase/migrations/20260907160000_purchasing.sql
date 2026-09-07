-- ============================================================================
-- Compras: proveedores y recepcion de mercancia
--
-- Cierra el ciclo del inventario. La entrada SUMA generando movimientos en
-- `stock_movements`, exactamente igual que la emision de una nota de entrega
-- RESTA generandolos: un solo libro mayor explica todo lo que entra y sale.
--
-- NOTA SOBRE LAS POLITICAS: la migracion de RLS corre ANTES que esta, y su bucle
-- se salta las tablas que todavia no existen (`if to_regclass(...) is null then
-- continue`). Por eso las politicas de estas tres tablas se crean AQUI. Si no se
-- hiciera, quedarian sin RLS pareciendo que la tienen — que es el fallo mas
-- peligroso posible en este esquema, y la razon de que el test de aislamiento
-- descubra las tablas del catalogo en vez de leer una lista.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id           uuid primary key,
  tenant_id    uuid        not null references public.tenants (id) on delete cascade,

  code         text        not null,
  name         text        not null,
  tax_id       text,
  email        text,
  phone        text,
  -- En un comercio pequeno se trata con una persona, no con una empresa.
  contact_name text,
  notes        text,

  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists suppliers_tenant_code_key
  on public.suppliers (tenant_id, code);

create index if not exists suppliers_tenant_name_idx
  on public.suppliers (tenant_id, name) where archived_at is null;

drop trigger if exists trg_suppliers_touch on public.suppliers;
create trigger trg_suppliers_touch before update on public.suppliers
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- goods_receipts
--
-- No hay estado `draft`. Recibir mercancia es un hecho que ya ocurrio cuando
-- alguien lo escribe; un borrador de "voy a recibir esto" es una ORDEN DE
-- COMPRA, que es otro documento con otro ciclo de vida y no esta en el alcance.
--
-- La FK al proveedor es `deferrable initially deferred` por la misma razon que
-- la de las notas de entrega al cliente: purgar un sandbox borra el tenant, y
-- Postgres no garantiza el orden en que resuelve las cascadas.
-- ---------------------------------------------------------------------------
create table if not exists public.goods_receipts (
  id                  uuid primary key,
  tenant_id           uuid        not null references public.tenants (id) on delete cascade,

  -- Correlativo INTERNO del tenant. Sin valor tributario, como todos los de
  -- este sistema.
  number              text        not null,
  supplier_id         uuid        not null
                        references public.suppliers (id)
                        deferrable initially deferred,
  purchase_order_id   uuid,

  status              text        not null,
  currency            text        not null,
  total_minor         bigint      not null,

  -- Como numera el proveedor su propio documento. Texto libre: cada uno lo hace
  -- a su manera, y normalizarlo obligaria a rechazar referencias legitimas.
  supplier_reference  text,
  notes               text,

  received_at         timestamptz,
  received_by         uuid,
  voided_at           timestamptz,
  void_reason         text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint goods_receipts_status_check   check (status in ('draft', 'received', 'voided')),
  constraint goods_receipts_currency_check check (currency in ('USD', 'VES')),
  constraint goods_receipts_total_check    check (total_minor >= 0),
  -- El estado y sus datos no pueden contradecirse.
  constraint goods_receipts_void_check check (
    (status = 'voided' and voided_at is not null and void_reason is not null)
    or (status <> 'voided' and voided_at is null and void_reason is null)
  )
);

create unique index if not exists goods_receipts_tenant_number_key
  on public.goods_receipts (tenant_id, number);

create index if not exists goods_receipts_tenant_received_idx
  on public.goods_receipts (tenant_id, received_at desc);

create index if not exists goods_receipts_tenant_supplier_idx
  on public.goods_receipts (tenant_id, supplier_id);

drop trigger if exists trg_goods_receipts_touch on public.goods_receipts;
create trigger trg_goods_receipts_touch before update on public.goods_receipts
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- goods_receipt_lines
--
-- El coste unitario se guarda por linea y NO se propaga al producto. Recalcular
-- el coste medio en cada recepcion es una decision contable —FIFO, medio
-- ponderado, ultimo coste— que un comercio pequeno no ha tomado, y tomarla por
-- el en silencio le cambiaria los margenes sin avisar.
-- ---------------------------------------------------------------------------
create table if not exists public.goods_receipt_lines (
  tenant_id            uuid    not null references public.tenants (id) on delete cascade,
  goods_receipt_id     uuid    not null references public.goods_receipts (id) on delete cascade,
  line_no              integer not null,

  product_id           uuid    not null
                         references public.products (id)
                         deferrable initially deferred,
  description_snapshot text    not null,
  unit_snapshot        text    not null,

  quantity             bigint  not null,
  unit_cost_minor      bigint  not null,
  line_total_minor     bigint  not null,

  primary key (goods_receipt_id, line_no),

  constraint goods_receipt_lines_line_no_check   check (line_no >= 1),
  constraint goods_receipt_lines_quantity_check  check (quantity > 0),
  constraint goods_receipt_lines_cost_check      check (unit_cost_minor >= 0),
  constraint goods_receipt_lines_total_check     check (line_total_minor >= 0)
);

-- Sostiene "cuanto le he comprado a este proveedor de este producto".
create index if not exists goods_receipt_lines_product_idx
  on public.goods_receipt_lines (tenant_id, product_id);

-- ---------------------------------------------------------------------------
-- Politicas
--
-- Mismo tratamiento que el resto: select/insert/update acotados al tenant, y el
-- borrado solo donde tiene sentido. Un documento de recepcion NO se borra: se
-- anula, y la anulacion genera su movimiento compensatorio.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array['suppliers', 'goods_receipts', 'goods_receipt_lines'];
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

    -- El WITH CHECK impide mover una fila propia al tenant de otro cambiandole
    -- el tenant_id. Sin el, el USING dejaria pasar esa escritura.
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using (tenant_id = app.current_tenant() and app.can_write())
        with check (tenant_id = app.current_tenant() and app.can_write())
    $f$, t || '_update', t);
  end loop;
end $$;

-- Un proveedor sin historico se puede borrar; uno con recepciones se archiva, y
-- la clave foranea lo impide llegado el caso.
drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (tenant_id = app.current_tenant() and app.is_admin());

-- Los documentos NO se borran. Anular deja rastro; borrar lo elimina, y ademas
-- dejaria movimientos de inventario sin origen que los explique.
drop policy if exists goods_receipts_delete on public.goods_receipts;
create policy goods_receipts_delete on public.goods_receipts for delete to authenticated
  using (false);

drop policy if exists goods_receipt_lines_delete on public.goods_receipt_lines;
create policy goods_receipt_lines_delete on public.goods_receipt_lines for delete to authenticated
  using (tenant_id = app.current_tenant() and app.is_admin());

grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update on public.goods_receipts to authenticated;
grant select, insert, update, delete on public.goods_receipt_lines to authenticated;

-- ---------------------------------------------------------------------------
-- El correlativo de recepciones
--
-- `document_sequences.doc_type` tiene una restriccion CHECK con la lista de
-- tipos. Sin ampliarla, la primera recepcion falla al pedir su numero.
-- ---------------------------------------------------------------------------
alter table public.document_sequences
  drop constraint if exists document_sequences_type_check;

alter table public.document_sequences
  add constraint document_sequences_type_check
  check (doc_type in ('quote', 'delivery_note', 'purchase_order', 'payment', 'goods_receipt'));

-- ---------------------------------------------------------------------------
-- El movimiento de inventario que genera una recepcion
--
-- `stock_movements.ref_type` es texto libre por diseno, asi que no hace falta
-- tocar nada: las entradas se registran con ref_type 'goods_receipt' y las
-- anulaciones con 'goods_receipt_void'.
-- ---------------------------------------------------------------------------
