-- ============================================================================
-- Semilla del entorno de demostracion.
--
-- La ejecutan `supabase start` y `supabase db reset` (ver [db.seed] en
-- config.toml). Sin ella, `DATA_DRIVER=postgres pnpm dev` arranca contra una
-- base vacia: `loadTenantProfile` no encuentra la pertenencia, devuelve null y
-- todas las politicas RLS niegan. La aplicacion se ve entera pero sin un dato.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE ESTOS DATOS Y NO OTROS
--
-- Son EXACTAMENTE los mismos clientes, productos y notas que siembra el driver
-- en memoria (apps/web/src/composition/memory-driver.ts): mismos codigos, mismos
-- SKU, mismos precios, mismas existencias y los mismos cinco correlativos.
--
-- No es duplicacion por descuido, es el requisito que hace que la suite BDD
-- corra contra los dos adaptadores sin cambiar una linea de Gherkin. Un escenario
-- que dice "veo el cliente Bodega La Esquina" solo puede ser agnostico del
-- almacenamiento si ambos almacenamientos parten del mismo mundo. Si estas dos
-- fuentes divergen, los tests dejan de comprobar la arquitectura hexagonal y
-- pasan a comprobar el adaptador que tocase ese dia.
--
-- Al cambiar una, hay que cambiar la otra.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Dos cosas mas que este archivo hace a proposito:
--
--   1. Los totales, el impuesto y la conversion NO se escriben a mano: se
--      calculan aqui con la misma aritmetica entera que usa el dominio (bigint
--      de unidades menores, HALF_UP). Copiar totales a mano produce una demo que
--      se contradice a si misma en cuanto alguien suma las lineas.
--
--   2. El inventario se construye por MOVIMIENTOS, no fijando el saldo. Cada
--      salida escribe su fila en stock_movements y actualiza products.on_hand,
--      igual que hace el dominio. Asi el libro mayor cuadra con el saldo desde el
--      primer segundo, que es justo lo que una siembra a mano nunca hace.
--
-- Se ejecuta como `postgres`, que salta las politicas RLS. Es correcto: sembrar
-- es una operacion de plataforma, no de un usuario del tenant.
--
-- ESCALAS, no negociables (ver packages/domain/src/shared/value-objects):
--   Money    -> bigint, escala 2   (1,20 USD  -> 120)
--   Quantity -> bigint, escala 3   (18,5 kg   -> 18500)
--   Tasa     -> bigint, escala 8   (36,50 Bs  -> 3650000000)
-- ============================================================================

do $seed$
declare
  v_tenant   uuid    := '00000000-0000-4000-8000-000000000001';
  v_owner    uuid    := '00000000-0000-4000-8000-000000000002';
  v_rate     bigint  := 3650000000;  -- 36,50 Bs por USD, escala 8
  v_tax_bp   integer := 1600;        -- 16,00 % informativo

  r          record;  -- nota en curso
  lr         record;  -- linea en curso

  v_note_id  uuid;
  v_issued   timestamptz;
  v_subtotal bigint;
  v_taxbase  bigint;
  v_tax      bigint;
  v_total    bigint;
  v_gross    bigint;
  v_discount bigint;
  v_line     bigint;
  v_balance  bigint;
  v_docs_mes bigint;
begin
  -- Sembrar dos veces duplicaria el inventario y descuadraria los contadores.
  if exists (select 1 from public.tenants where id = v_tenant) then
    raise notice 'CoreBiz: el tenant de demostracion ya existe; no se siembra nada.';
    return;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Cuenta de acceso
  --
  -- Contrasena: `corebiz-demo`. Sirve para entrar de verdad por la pantalla de
  -- acceso, no solo para que la fila exista. `email_confirmed_at` va relleno:
  -- sin el, GoTrue rechaza el acceso pidiendo una confirmacion que en local
  -- nadie va a abrir, y la cuenta quedaria inaccesible por un correo que no
  -- existe.
  --
  -- El identificador coincide con DEMO_USER_ID del composition root, igual que
  -- el del tenant coincide con DEMO_TENANT_ID. Es lo que permite que quien llega
  -- sin cuenta vea la aplicacion funcionando.
  -- ─────────────────────────────────────────────────────────────────────────
  --
  -- Las cuatro columnas de token van a CADENA VACIA y no se dejan en NULL, que
  -- es lo que Postgres pondria. GoTrue las lee en variables de texto que no
  -- admiten nulo, asi que con NULL el acceso falla entero con un
  -- "Database error querying schema" que no menciona ni la columna ni la tabla.
  -- Es media hora de depuracion por cuatro cadenas vacias.
  --
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
    'demo@corebiz.local',
    extensions.crypt('corebiz-demo', extensions.gen_salt('bf')),
    now(), now() - interval '120 days', now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Ana Rodriguez"}'::jsonb
  )
  on conflict (id) do nothing;

  -- Sin esta fila, GoTrue no reconoce que la cuenta tiene un metodo de acceso
  -- por correo y contrasena: el usuario existe y aun asi no puede entrar.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_owner::text, v_owner,
    jsonb_build_object('sub', v_owner::text, 'email', 'demo@corebiz.local', 'email_verified', true),
    'email', now(), now() - interval '120 days', now()
  )
  on conflict (provider_id, provider) do nothing;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Tenant y pertenencia
  -- ─────────────────────────────────────────────────────────────────────────
  insert into public.tenants (
    id, slug, name, plan_code, status, is_demo,
    base_currency, exchange_rate_scaled, exchange_rate_at,
    tax_label, tax_rate_bp, created_at
  ) values (
    v_tenant, 'comercial-demo', 'Comercial Demo, C.A.', 'free', 'active', true,
    'USD', v_rate, now() - interval '1 day',
    'Impuesto informativo', v_tax_bp, now() - interval '120 days'
  );

  insert into public.memberships (tenant_id, user_id, role, status, created_at)
  values (v_tenant, v_owner, 'owner', 'active', now() - interval '120 days');

  -- ─────────────────────────────────────────────────────────────────────────
  -- Clientes
  --
  -- El codigo es unico DENTRO del tenant, no globalmente: otra empresa puede
  -- tener tambien su CLI-001.
  -- ─────────────────────────────────────────────────────────────────────────
  insert into public.customers (
    id, tenant_id, code, name, tax_id, email,
    credit_limit_minor, credit_limit_currency, created_at
  )
  select
    ('10000000-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid,
    v_tenant, c.code, c.name, c.tax_id,
    'contacto@' || lower(c.code) || '.ve',
    c.credit_limit,
    case when c.credit_limit is null then null else 'USD' end,
    now() - interval '110 days'
  from (values
    (1, 'CLI-001', 'Bodega La Esquina',       'J-30456789-1', 150000::bigint),
    (2, 'CLI-002', 'Panaderia Santa Rosa',    'J-31122334-5',  80000),
    (3, 'CLI-003', 'Ferreteria El Tornillo',  'J-29887766-0', 300000),
    (4, 'CLI-004', 'Farmacia San Jose',       'J-30111222-3',    null),
    (5, 'CLI-005', 'Licoreria El Brindis',    'J-31998877-6', 220000),
    (6, 'CLI-006', 'Charcuteria Los Andes',   'J-30554433-2',  95000),
    (7, 'CLI-007', 'Supermercado Mi Barrio',  'J-29334455-7', 500000),
    (8, 'CLI-008', 'Restaurante Dona Carmen', 'J-31667788-4', 120000)
  ) as c(n, code, name, tax_id, credit_limit);

  -- ─────────────────────────────────────────────────────────────────────────
  -- Catalogo
  --
  -- `on_hand` entra en CERO: el saldo lo construyen los movimientos de abajo.
  -- Fijarlo aqui y ademas insertar movimientos dejaria el libro mayor mintiendo.
  --
  -- SRV-001 no lleva inventario. No es que su saldo sea cero: es que la pregunta
  -- no aplica, y el dominio ni descuenta ni deja ajustar. Es la rama que de otro
  -- modo no ejercitaria ningun dato de ejemplo.
  -- ─────────────────────────────────────────────────────────────────────────
  insert into public.products (
    id, tenant_id, sku, name, unit,
    price_minor, price_currency,
    taxable, track_stock, on_hand, min_stock, stock_policy, created_at
  )
  select
    ('20000000-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid,
    v_tenant, p.sku, p.name, p.unit,
    p.price, 'USD',
    true, p.track, 0, p.min_stock, 'deny_negative',
    now() - interval '115 days'
  from (values
    ( 1, 'HRN-001', 'Harina de trigo 1 kg',   'und', 120::bigint, true,  50000::bigint),
    ( 2, 'AZC-001', 'Azucar refinada 1 kg',   'und', 145,         true,  40000),
    ( 3, 'ARZ-001', 'Arroz blanco 1 kg',      'und', 110,         true,  60000),
    ( 4, 'ACT-001', 'Aceite de maiz 1 L',     'und', 280,         true,  30000),
    ( 5, 'CAF-001', 'Cafe molido 250 g',      'und', 350,         true,  20000),
    ( 6, 'LCH-001', 'Leche en polvo 900 g',   'und', 690,         true,  15000),
    ( 7, 'PST-001', 'Pasta larga 1 kg',       'und', 135,         true,  50000),
    ( 8, 'QSO-001', 'Queso blanco',           'kg',  560,         true,  10000),
    ( 9, 'JMN-001', 'Jamon de pierna',        'kg',  820,         true,   8000),
    (10, 'REF-001', 'Refresco 2 L',           'und', 175,         true,  40000),
    (11, 'PPL-001', 'Papel higienico x4',     'und', 210,         true,  25000),
    (12, 'DTG-001', 'Detergente 1 kg',        'und', 295,         true,  20000),
    (13, 'SRV-001', 'Despacho a domicilio',   'und', 500,         false,  null)
  ) as p(n, sku, name, unit, price, track, min_stock);

  -- ─────────────────────────────────────────────────────────────────────────
  -- Existencias iniciales
  --
  -- Un movimiento de entrada por producto con inventario, con su saldo
  -- resultante. Es el mismo asiento que escribe el dominio al dar de alta un
  -- producto con existencia inicial.
  -- ─────────────────────────────────────────────────────────────────────────
  create temporary table seed_initial (sku text primary key, qty bigint) on commit drop;
  insert into seed_initial (sku, qty) values
    ('HRN-001', 240000), ('AZC-001', 180000), ('ARZ-001', 320000), ('ACT-001',  95000),
    ('CAF-001',  64000), ('LCH-001',  42000), ('PST-001', 210000), ('QSO-001',  18500),
    ('JMN-001',  12250), ('REF-001', 150000), ('PPL-001',  88000), ('DTG-001',  70000);

  insert into public.stock_movements (
    id, tenant_id, product_id, kind, quantity, balance_after,
    ref_type, ref_id, note, occurred_at
  )
  select
    extensions.uuid_generate_v4(), v_tenant, p.id, 'in', s.qty, s.qty,
    'initial', null, 'Existencia inicial de la carga de datos',
    now() - interval '115 days'
  from public.products p
  join seed_initial s on s.sku = p.sku
  where p.tenant_id = v_tenant;

  update public.products p
     set on_hand = s.qty
    from seed_initial s
   where p.tenant_id = v_tenant and p.sku = s.sku;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Notas de entrega
  --
  -- Documentos internos SIN valor fiscal. El correlativo es interno del tenant y
  -- no tiene valor tributario alguno.
  --
  -- Las fechas van relativas a `now()`: la demostracion tiene que parecer un
  -- negocio con actividad reciente cualquier dia que alguien la abra, no un
  -- archivo congelado el dia que se escribio esta semilla.
  -- ─────────────────────────────────────────────────────────────────────────
  create temporary table seed_notes (
    no       integer primary key,
    customer text    not null,
    days_ago integer not null
  ) on commit drop;

  insert into seed_notes (no, customer, days_ago) values
    (1, 'CLI-001', 24),
    (2, 'CLI-003', 18),
    (3, 'CLI-007', 12),
    (4, 'CLI-002',  6),
    (5, 'CLI-008',  2);

  create temporary table seed_lines (
    note_no integer not null,
    line_no integer not null,
    sku     text    not null,
    qty     bigint  not null,   -- escala 3
    primary key (note_no, line_no)
  ) on commit drop;

  insert into seed_lines (note_no, line_no, sku, qty) values
    (1, 1, 'HRN-001', 20000), (1, 2, 'AZC-001', 15000), (1, 3, 'ARZ-001', 30000),
    (2, 1, 'DTG-001', 12000), (2, 2, 'PPL-001', 10000),
    (3, 1, 'REF-001', 48000), (3, 2, 'PST-001', 25000), (3, 3, 'ACT-001', 10000),
    (4, 1, 'HRN-001', 40000), (4, 2, 'LCH-001',  8000),
    (5, 1, 'QSO-001',  3500), (5, 2, 'JMN-001',  2250);

  -- ─────────────────────────────────────────────────────────────────────────
  -- Emision
  --
  -- HALF_UP con enteros: (a * b + divisor / 2) / divisor. Todas las magnitudes
  -- son positivas aqui, asi que la division truncada de Postgres basta.
  -- ─────────────────────────────────────────────────────────────────────────
  for r in select * from seed_notes order by no loop
    v_note_id  := ('30000000-0000-4000-8000-' || lpad(r.no::text, 12, '0'))::uuid;
    v_issued   := now() - (r.days_ago * interval '1 day');
    v_subtotal := 0;
    v_taxbase  := 0;

    -- Cabecera con totales provisionales: se corrigen al cerrar las lineas. Va
    -- primero porque las lineas la referencian.
    insert into public.delivery_notes (
      id, tenant_id, number, customer_id, status, currency,
      exchange_rate_scaled, exchange_rate_from, exchange_rate_to, exchange_rate_at,
      tax_label_snapshot, tax_rate_bp_snapshot,
      subtotal_minor, tax_minor, total_minor, total_secondary_minor,
      issued_at, issued_by, created_at
    )
    select
      v_note_id, v_tenant,
      'NE-' || lpad(r.no::text, 6, '0'),
      c.id,
      'issued', 'USD',
      -- La tasa queda CONGELADA con la fecha en que se capturo, que es la del
      -- dia de la emision. Reimprimir esta nota dentro de un ano tiene que
      -- seguir diciendo lo que dijo hoy.
      v_rate, 'USD', 'VES', v_issued,
      'Impuesto informativo', v_tax_bp,
      0, 0, 0, 0,
      v_issued, v_owner, v_issued
    from public.customers c
    where c.tenant_id = v_tenant and c.code = r.customer;

    for lr in
      select l.line_no, l.qty,
             p.id as product_id, p.name, p.unit, p.price_minor, p.taxable, p.track_stock
        from seed_lines l
        join public.products p on p.tenant_id = v_tenant and p.sku = l.sku
       where l.note_no = r.no
       order by l.line_no
    loop
      -- Se redondea UNA sola vez, tras aplicar cantidad y descuento. Redondear
      -- en dos pasos acumula desviacion documento abajo.
      v_gross    := (lr.price_minor * lr.qty + 500) / 1000;
      v_discount := 0;
      v_line     := v_gross - v_discount;

      insert into public.delivery_note_lines (
        tenant_id, delivery_note_id, line_no, product_id,
        description_snapshot, unit_snapshot,
        quantity, unit_price_minor, discount_bp, taxable, line_total_minor
      ) values (
        v_tenant, v_note_id, lr.line_no, lr.product_id,
        lr.name, lr.unit,
        lr.qty, lr.price_minor, 0, lr.taxable, v_line
      );

      v_subtotal := v_subtotal + v_line;
      if lr.taxable then
        v_taxbase := v_taxbase + v_line;
      end if;

      if lr.track_stock then
        update public.products
           set on_hand = on_hand - lr.qty
         where id = lr.product_id
        returning on_hand into v_balance;

        insert into public.stock_movements (
          id, tenant_id, product_id, kind, quantity, balance_after,
          ref_type, ref_id, note, occurred_at
        ) values (
          extensions.uuid_generate_v4(), v_tenant, lr.product_id, 'out', -lr.qty, v_balance,
          'delivery_note', v_note_id::text, null, v_issued
        );
      end if;
    end loop;

    v_tax   := (v_taxbase * v_tax_bp + 5000) / 10000;
    v_total := v_subtotal + v_tax;

    update public.delivery_notes
       set subtotal_minor        = v_subtotal,
           tax_minor             = v_tax,
           total_minor           = v_total,
           -- Conversion con la tasa CONGELADA del documento, no con la de hoy.
           total_secondary_minor = (v_total * v_rate + 50000000) / 100000000
     where id = v_note_id;
  end loop;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Correlativo
  --
  -- Apunta al siguiente numero libre. Si quedara desfasado, la primera nota que
  -- emitiera la aplicacion chocaria contra el indice unico (tenant_id, number),
  -- y fallaria en la accion mas visible que tiene el producto.
  -- ─────────────────────────────────────────────────────────────────────────
  insert into public.document_sequences (tenant_id, doc_type, prefix, next_number, padding)
  values (v_tenant, 'delivery_note', 'NE', (select max(no) + 1 from seed_notes), 6);

  -- ─────────────────────────────────────────────────────────────────────────
  -- Contadores de consumo
  --
  -- Se derivan de las filas reales, nunca a ojo: son lo que el caso de uso lee
  -- para decidir si cabe un alta mas. Un contador sembrado a mano hace que la
  -- cuota bloquee antes o despues de lo que dice la pantalla.
  --
  -- `documents_month` cuenta solo el mes UTC en curso, que es el periodo con el
  -- que lo lee `usagePeriod()` en el adaptador.
  -- ─────────────────────────────────────────────────────────────────────────
  select count(*) into v_docs_mes
    from public.delivery_notes
   where tenant_id = v_tenant
     and date_trunc('month', issued_at at time zone 'UTC')
       = date_trunc('month', now() at time zone 'UTC');

  insert into public.tenant_usage (tenant_id, resource, period, count) values
    (v_tenant, 'customers', 'total',
      (select count(*) from public.customers   where tenant_id = v_tenant)),
    (v_tenant, 'products',  'total',
      (select count(*) from public.products    where tenant_id = v_tenant)),
    (v_tenant, 'users',     'total',
      (select count(*) from public.memberships where tenant_id = v_tenant)),
    (v_tenant, 'documents_month', to_char(now() at time zone 'UTC', 'YYYY-MM'), v_docs_mes);

  -- ─────────────────────────────────────────────────────────────────────────
  -- Auditoria
  --
  -- Unas pocas entradas para que el visor tenga algo que mostrar desde el primer
  -- arranque. La IP va como hash, nunca en claro: el registro sirve para
  -- reconstruir que paso, no para perfilar a quien lo hizo.
  -- ─────────────────────────────────────────────────────────────────────────
  insert into public.audit_log (
    id, tenant_id, actor_id, actor_email, action, entity_type, entity_id,
    summary, ip_hash, user_agent, occurred_at
  )
  select
    extensions.uuid_generate_v4(), v_tenant, v_owner, 'demo@corebiz.local',
    'delivery_note.issued', 'delivery_note', dn.id,
    jsonb_build_object('number', dn.number, 'total', dn.total_minor, 'currency', dn.currency),
    encode(extensions.digest('127.0.0.1' || to_char(dn.issued_at, 'YYYY-MM-DD'), 'sha256'), 'hex'),
    'Carga de datos de demostracion',
    dn.issued_at
  from public.delivery_notes dn
  where dn.tenant_id = v_tenant;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Estado de la plataforma
  --
  -- Lo lee el circuit breaker que protege el presupuesto de la capa gratuita.
  -- No lleva tenant_id: es la unica tabla del esquema que no pertenece a nadie.
  -- ─────────────────────────────────────────────────────────────────────────
  insert into public.system_flags (key, value) values
    ('demo_provisioning', '{"enabled": true, "mode": "normal", "max_concurrent": 50}'::jsonb)
  on conflict (key) do nothing;

  raise notice 'CoreBiz: entorno de demostracion sembrado (tenant %).', v_tenant;
end
$seed$;
