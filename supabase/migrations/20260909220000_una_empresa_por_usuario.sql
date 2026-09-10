-- ============================================================================
-- Una empresa por usuario, y una empresa que nace lista para trabajar.
--
-- DOS PROBLEMAS DISTINTOS, y los dos viven en la misma funcion.
--
-- 1. QUIEN PUEDE CREAR UNA EMPRESA.
--
--    La version anterior solo frenaba a quien ya era `owner` activo. Un usuario
--    invitado como admin, vendedor, almacen u observador podia crearse la suya
--    —comprobado con navegador—, que es justo lo que no debe pasar: a alguien traido
--    para administrar el negocio de otro se le da acceso a ese negocio, no una via
--    para montar el suyo desde dentro.
--
--    Se distinguen DOS codigos y la diferencia importa:
--
--      ALREADY_OWNER   ya tiene su empresa. La interfaz lo trata como el doble envio
--                      del formulario y sigue hacia dentro, que es lo que la persona
--                      esperaba.
--      ALREADY_MEMBER  pertenece a la empresa de otro. Es una NEGATIVA de verdad y
--                      tiene que verse como tal; colarlo por el mismo camino que el
--                      doble envio lo dejaria entrar sin empresa y sin explicacion.
--
--    El modelo de datos NO se toca: `memberships` sigue admitiendo N empresas por
--    usuario y el selector de empresa se queda donde esta. El dia que se quieran
--    varias, se levanta esta condicion y ya esta. Lo que hoy se decide es el ALTA,
--    no la estructura.
--
-- 2. UNA EMPRESA QUE NO PUEDE EMITIR NADA.
--
--    `exchange_rate_scaled` quedaba en NULL, y sin tasa no se emite una sola nota de
--    entrega: el caso de uso falla antes de abrir la transaccion. Una empresa recien
--    creada estaba rota hasta que alguien encontraba Ajustes. Ahora la tasa entra en
--    el alta, junto con la moneda y el impuesto.
--
--    La tasa sigue siendo OPCIONAL en la firma —quien opere solo en su moneda base no
--    tiene ninguna que dar— pero cuando llega, llega con su fecha de captura. Una tasa
--    sin fecha se lee como la de hoy, que es justo lo que no es.
-- ============================================================================

-- La firma cambia, asi que la anterior se retira: dejar las dos convierte "cual se
-- llamo" en una pregunta que depende de cuantos argumentos mando quien llama.
drop function if exists app.provision_tenant(text, text, text, integer);

create or replace function app.provision_tenant(
  p_name                 text,
  p_base_currency        text default 'USD',
  p_tax_label            text default 'Impuesto informativo',
  p_tax_rate_bp          integer default 1600,
  p_exchange_rate_scaled bigint default null,
  p_exchange_rate_at     timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid := extensions.uuid_generate_v4();
  v_base   text;
  v_slug   text;
  v_try    integer := 0;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED: hace falta una sesion para crear una empresa'
      using errcode = 'P0001';
  end if;

  if length(coalesce(trim(p_name), '')) < 2 then
    raise exception 'INVALID_NAME: el nombre de la empresa es demasiado corto'
      using errcode = 'P0001';
  end if;

  if p_base_currency not in ('USD', 'VES') then
    raise exception 'INVALID_CURRENCY: moneda no soportada' using errcode = 'P0001';
  end if;

  if p_tax_rate_bp < 0 or p_tax_rate_bp > 10000 then
    raise exception 'INVALID_TAX_RATE: el impuesto va de 0 a 10000 puntos basicos'
      using errcode = 'P0001';
  end if;

  if p_exchange_rate_scaled is not null and p_exchange_rate_scaled <= 0 then
    raise exception 'INVALID_EXCHANGE_RATE: la tasa tiene que ser positiva'
      using errcode = 'P0001';
  end if;

  -- Primero el caso propio, que es el benigno: quien ya tiene empresa suele estar
  -- reenviando el formulario.
  if exists (
    select 1 from public.memberships m
     where m.user_id = v_user and m.role = 'owner' and m.status = 'active'
  ) then
    raise exception 'ALREADY_OWNER: este usuario ya tiene una empresa'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.memberships m
     where m.user_id = v_user and m.status = 'active'
  ) then
    raise exception 'ALREADY_MEMBER: este usuario pertenece a la empresa de otro'
      using errcode = 'P0001';
  end if;

  v_base := coalesce(nullif(app.slugify(p_name), ''), 'empresa');
  v_slug := v_base;
  while exists (select 1 from public.tenants t where t.slug = v_slug) loop
    v_try  := v_try + 1;
    v_slug := v_base || '-' || v_try::text;
    if v_try > 50 then
      v_slug := v_base || '-' || substr(v_tenant::text, 1, 8);
      exit;
    end if;
  end loop;

  insert into public.tenants (
    id, slug, name, plan_code, status, is_demo,
    base_currency, tax_label, tax_rate_bp,
    exchange_rate_scaled, exchange_rate_at
  ) values (
    v_tenant, v_slug, trim(p_name), 'free', 'active', false,
    p_base_currency, p_tax_label, p_tax_rate_bp,
    p_exchange_rate_scaled,
    -- Fecha solo si hay tasa. Una fecha suelta diria que se capturo algo que no esta.
    case when p_exchange_rate_scaled is null then null
         else coalesce(p_exchange_rate_at, now()) end
  );

  insert into public.memberships (tenant_id, user_id, role, status)
  values (v_tenant, v_user, 'owner', 'active');

  -- El correlativo se crea aqui para que la primera nota de entrega no dependa
  -- de un alta implicita en medio de la transaccion que la emite.
  insert into public.document_sequences (tenant_id, doc_type, prefix, next_number, padding)
  values (v_tenant, 'delivery_note', 'NE', 1, 6);

  -- El contador de usuarios arranca en 1: quien crea la empresa ya ocupa plaza.
  -- Dejarlo en cero haria que el plan gratuito admitiese un usuario de mas.
  insert into public.tenant_usage (tenant_id, resource, period, count)
  values (v_tenant, 'users', 'total', 1);

  return v_tenant;
end $fn$;

revoke all on function app.provision_tenant(text, text, text, integer, bigint, timestamptz) from public;
grant execute on function app.provision_tenant(text, text, text, integer, bigint, timestamptz) to authenticated;
