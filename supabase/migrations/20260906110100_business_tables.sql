-- ============================================================================
-- Tablas de negocio: clientes, catalogo, inventario y notas de entrega.
--
-- CoreBiz emite NOTAS DE ENTREGA, documentos internos sin valor fiscal. No hay
-- numeracion de control ni tributo declarado en ninguna parte de este.  [no-fiscal-ok]
--
-- El marcador exime a la linea del guardian de vocabulario tributario: el aviso
-- NIEGA tener esa numeracion, no la reclama. Ver scripts/check-non-fiscal.sh.
-- Ver docs/adr/003-notas-de-entrega.md.
--
-- Correspondencia con el dominio (packages/domain/src):
--   customers            <- customers/customer.ts        (CustomerProps)
--   products             <- products/product.ts          (ProductProps)
--   stock_movements      <- products/product.ts          (StockMovement)
--   delivery_notes       <- sales/delivery-note/...      (DeliveryNoteProps)
--   delivery_note_lines  <- sales/delivery-note/...      (DeliveryNoteLine)
--
-- Escalas fijadas por los value objects, y no negociables aqui:
--   Money     -> bigint de unidades menores, escala 2  (Money.fromMinor)
--   Quantity  -> bigint escala 3                       (Quantity.fromScaled)
--   Tasa      -> bigint escala 8                       (ExchangeRate.fromScaled)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SOBRE LAS CLAVES FORANEAS ENTRE DOCUMENTOS Y MAESTROS
--
-- Un cliente con notas emitidas no se puede borrar: el documento quedaria
-- apuntando al vacio y el historico dejaria de poder explicarse. Pero purgar un
-- sandbox borra su tenant, y eso arrastra en cascada clientes y notas a la vez.
--
-- Con `on delete restrict` la purga fallaria, porque Postgres no garantiza el
-- orden en que resuelve las cascadas. La solucion es `deferrable initially
-- deferred`: la integridad se comprueba al CONFIRMAR la transaccion, no en cada
-- fila. Borrar un cliente suelto sigue fallando —la nota lo sigue referenciando
-- al final de la transaccion—, mientras que borrar el tenant entero funciona,
-- porque para cuando se confirma ya no queda ninguna de las dos filas.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id                    uuid primary key,
  tenant_id             uuid        not null references public.tenants (id) on delete cascade,

  -- El dominio normaliza: code en mayusculas, email en minusculas, todo sin
  -- espacios sobrantes. Aqui se guarda ya normalizado.
  code                  text        not null,
  name                  text        not null,
  tax_id                text,
  email                 text,
  phone                 text,
  -- CustomerAddress es un objeto de campos opcionales: cabe en una columna sin
  -- inventar una tabla de direcciones que nadie ha pedido.
  address               jsonb,

  credit_limit_minor    bigint,
  credit_limit_currency text,

  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Money es indivisible: importe y moneda existen juntos o no existe ninguno.
  constraint customers_credit_limit_check check (
    (credit_limit_minor is null and credit_limit_currency is null)
    or (credit_limit_minor is not null and credit_limit_currency is not null)
  ),
  constraint customers_credit_currency_check check (
    credit_limit_currency is null or credit_limit_currency in ('USD', 'VES')
  ),
  constraint customers_credit_positive_check check (
    credit_limit_minor is null or credit_limit_minor >= 0
  )
);

-- El codigo es unico DENTRO del tenant, no globalmente: dos empresas distintas
-- pueden tener cada una su cliente CLI-001.
create unique index if not exists customers_tenant_code_key
  on public.customers (tenant_id, code);

-- El listado ordena por nombre y oculta los archivados.
create index if not exists customers_tenant_name_idx
  on public.customers (tenant_id, name) where archived_at is null;

drop trigger if exists trg_customers_touch on public.customers;
create trigger trg_customers_touch before update on public.customers
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- products
--
-- El saldo `on_hand` vive materializado aqui, y el libro mayor de movimientos
-- esta en stock_movements. No es event sourcing puro y es deliberado: leer el
-- stock de un producto es leer una columna, no sumar su historia entera. El
-- ledger es el registro auditable; esta columna es su proyeccion.
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id             uuid primary key,
  tenant_id      uuid        not null references public.tenants (id) on delete cascade,

  sku            text        not null,
  name           text        not null,
  description    text,
  unit           text        not null default 'und',

  price_minor    bigint      not null,
  price_currency text        not null,
  cost_minor     bigint,
  cost_currency  text,

  taxable        boolean     not null default true,
  -- Un servicio no tiene existencias. Con track_stock en false el dominio ni
  -- descuenta ni deja ajustar: no es que el saldo sea cero, es que no aplica.
  track_stock    boolean     not null default true,
  on_hand        bigint      not null default 0,
  min_stock      bigint,
  -- deny_negative | allow_negative — ver StockPolicy en el dominio.
  stock_policy   text        not null default 'deny_negative',

  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint products_price_currency_check  check (price_currency in ('USD', 'VES')),
  constraint products_price_positive_check  check (price_minor >= 0),
  constraint products_cost_check check (
    (cost_minor is null and cost_currency is null)
    or (cost_minor is not null and cost_currency is not null and cost_currency in ('USD', 'VES'))
  ),
  constraint products_stock_policy_check    check (stock_policy in ('deny_negative', 'allow_negative')),
  constraint products_min_stock_check       check (min_stock is null or min_stock >= 0),
  -- El saldo negativo solo es legitimo si la politica lo permite. Sin esta
  -- comprobacion, un adaptador con un error de signo corrompe el inventario en
  -- silencio y solo se descubre al contar fisicamente.
  constraint products_on_hand_check check (
    stock_policy = 'allow_negative' or on_hand >= 0
  )
);

create unique index if not exists products_tenant_sku_key
  on public.products (tenant_id, sku);

create index if not exists products_tenant_name_idx
  on public.products (tenant_id, name) where archived_at is null;

-- Indice parcial para la alerta de reposicion: solo entran las filas que pueden
-- estar bajo minimo, que son una fraccion del catalogo.
create index if not exists products_below_minimum_idx
  on public.products (tenant_id, on_hand)
  where track_stock and min_stock is not null and archived_at is null;

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch before update on public.products
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- stock_movements — libro mayor de inventario.
--
-- Cada fila es un hecho ocurrido: no se edita ni se borra. Una salida se anula
-- con un movimiento de compensacion que la contrarresta, nunca borrando la
-- original. Por eso la politica RLS de esta tabla es `delete using (false)`.
--
-- No lleva updated_at: un hecho no se actualiza.
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id            uuid primary key,
  tenant_id     uuid        not null references public.tenants (id) on delete cascade,
  product_id    uuid        not null references public.products (id) on delete cascade,

  kind          text        not null,
  -- Delta CON SIGNO en escala 3: una salida guarda la cantidad en negativo.
  quantity      bigint      not null,
  -- Saldo resultante, calculado por el dominio. Guardarlo permite auditar el
  -- inventario en cualquier momento del pasado sin reproducir toda la cadena.
  balance_after bigint      not null,

  -- Referencia polimorfica al documento que lo origino: 'initial',
  -- 'delivery_note', 'delivery_note_void', 'adjust'. Es texto y no uuid porque
  -- el dominio lo declara como string y la base de datos no debe ser mas
  -- estricta que el tipo que almacena.
  ref_type      text,
  ref_id        text,
  note          text,

  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now(),

  constraint stock_movements_kind_check
    check (kind in ('in', 'out', 'adjust', 'void_compensation')),
  -- Un movimiento que no mueve nada no es un movimiento. El dominio ya descarta
  -- los ajustes de delta cero; esto impide que entren por otra via.
  constraint stock_movements_quantity_check check (quantity <> 0)
);

-- El historico de un producto se lee del mas reciente al mas antiguo.
create index if not exists stock_movements_product_time_idx
  on public.stock_movements (tenant_id, product_id, occurred_at desc);

-- Para rastrear que movimientos genero un documento concreto.
create index if not exists stock_movements_ref_idx
  on public.stock_movements (tenant_id, ref_type, ref_id);

-- ---------------------------------------------------------------------------
-- delivery_notes
--
-- La tasa de cambio y el impuesto quedan CONGELADOS en el documento. Reimprimir
-- una nota de marzo con la tasa de septiembre reescribiria el historico contable
-- del negocio cada vez que alguien la abre. Ver docs/adr/002-dinero-y-moneda-dual.md.
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_notes (
  id                     uuid primary key,
  tenant_id              uuid        not null references public.tenants (id) on delete cascade,

  -- Correlativo interno del tenant. Sin valor fiscal.
  number                 text        not null,
  customer_id            uuid        not null
                           references public.customers (id)
                           deferrable initially deferred,
  quote_id               uuid,

  status                 text        not null,
  currency               text        not null,

  exchange_rate_scaled   bigint      not null,
  exchange_rate_from     text        not null,
  exchange_rate_to       text        not null,
  -- Cuando se capturo la tasa. Sin esta fecha el dato invita a leerse como la
  -- tasa de hoy, que es justo lo que no es.
  exchange_rate_at       timestamptz not null,

  tax_label_snapshot     text        not null,
  tax_rate_bp_snapshot   integer     not null,

  -- Totales congelados. NO se recalculan al leer: el documento dice lo que dijo
  -- el dia que se emitio, aunque hoy el precio del producto sea otro.
  subtotal_minor         bigint      not null,
  tax_minor              bigint      not null,
  total_minor            bigint      not null,
  -- Expresado en exchange_rate_to, no en `currency`.
  total_secondary_minor  bigint      not null,

  issued_at              timestamptz,
  issued_by              uuid,
  delivered_at           timestamptz,
  received_by            text,
  voided_at              timestamptz,
  void_reason            text,
  notes                  text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint delivery_notes_status_check
    check (status in ('draft', 'issued', 'delivered', 'voided')),
  constraint delivery_notes_currency_check   check (currency in ('USD', 'VES')),
  constraint delivery_notes_rate_from_check  check (exchange_rate_from in ('USD', 'VES')),
  constraint delivery_notes_rate_to_check    check (exchange_rate_to in ('USD', 'VES')),
  constraint delivery_notes_rate_positive    check (exchange_rate_scaled > 0),
  constraint delivery_notes_tax_rate_check   check (tax_rate_bp_snapshot between 0 and 10000),
  -- Una nota anulada tiene motivo y fecha, y una que no lo esta no tiene
  -- ninguno de los dos. El estado y sus datos no pueden contradecirse.
  constraint delivery_notes_void_check check (
    (status = 'voided' and voided_at is not null and void_reason is not null)
    or (status <> 'voided' and voided_at is null and void_reason is null)
  )
);

create unique index if not exists delivery_notes_tenant_number_key
  on public.delivery_notes (tenant_id, number);

-- El registro se lista de la mas reciente a la mas antigua.
create index if not exists delivery_notes_tenant_issued_idx
  on public.delivery_notes (tenant_id, issued_at desc);

create index if not exists delivery_notes_tenant_customer_idx
  on public.delivery_notes (tenant_id, customer_id);

drop trigger if exists trg_delivery_notes_touch on public.delivery_notes;
create trigger trg_delivery_notes_touch before update on public.delivery_notes
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- delivery_note_lines
--
-- La linea congela el nombre y la unidad del producto tal como estaban al
-- emitir. Si manana el producto se renombra, la nota sigue diciendo lo que se
-- entrego, que es el unico dato que le sirve a quien la recibio.
--
-- No guarda moneda: es la de la nota. Repetirla por linea seria una via para
-- que un documento acabe con dos monedas distintas dentro.
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_note_lines (
  tenant_id            uuid    not null references public.tenants (id) on delete cascade,
  delivery_note_id     uuid    not null references public.delivery_notes (id) on delete cascade,
  -- Identidad de la linea dentro del documento; no hace falta un uuid propio.
  line_no              integer not null,

  product_id           uuid    not null
                         references public.products (id)
                         deferrable initially deferred,
  description_snapshot text    not null,
  unit_snapshot        text    not null,

  quantity             bigint  not null,
  unit_price_minor     bigint  not null,
  discount_bp          integer not null default 0,
  taxable              boolean not null default true,
  -- Redondeado UNA sola vez, por el dominio. Recalcularlo al leer produciria
  -- diferencias de centimos entre lo que dice la nota y lo que dice la pantalla.
  line_total_minor     bigint  not null,

  primary key (delivery_note_id, line_no),

  constraint delivery_note_lines_line_no_check   check (line_no >= 1),
  constraint delivery_note_lines_quantity_check  check (quantity > 0),
  constraint delivery_note_lines_price_check     check (unit_price_minor >= 0),
  constraint delivery_note_lines_discount_check  check (discount_bp between 0 and 10000),
  constraint delivery_note_lines_total_check     check (line_total_minor >= 0)
);

-- Sostiene el informe de productos mas vendidos.
create index if not exists delivery_note_lines_product_idx
  on public.delivery_note_lines (tenant_id, product_id);
