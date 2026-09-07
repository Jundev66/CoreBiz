-- ============================================================================
-- Invitaciones
--
-- Es lo que permite que un tenant crezca mas alla de su fundador. Sin esto, la
-- multi-tenancy esta construida y probada pero solo la puede usar una persona.
--
-- Ver docs/ROADMAP.md (H4).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- invitations
--
-- EL TOKEN NO SE GUARDA. Se guarda su SHA-256, igual que una contrasena.
--
-- Un token de invitacion es una credencial: quien lo tenga entra en la empresa
-- con el rol que diga la fila. Guardarlo en claro significa que cualquiera con
-- lectura sobre esta tabla —una copia de seguridad mal puesta, un volcado de
-- depuracion, un `select *` en un panel de administracion— se convierte en
-- miembro de cualquier tenant que tenga una invitacion pendiente.
--
-- El original solo existe dos veces: en el enlace que se le entrega a quien
-- invita, y en la URL que abre quien acepta. Si se pierde, no se recupera: se
-- revoca y se manda otra. Esa es la propiedad que se quiere.
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key,
  tenant_id   uuid        not null references public.tenants (id) on delete cascade,

  email       text        not null,
  role        text        not null,

  -- SHA-256 en hexadecimal del token entregado. 64 caracteres.
  token_hash  text        not null,

  invited_by  uuid        references auth.users (id) on delete set null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid        references auth.users (id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),

  -- Replica ROLES de packages/domain/src/access/role.ts, menos `owner`: la
  -- propiedad de una empresa se transfiere, no se reparte por correo.
  constraint invitations_role_check
    check (role in ('admin', 'sales', 'warehouse', 'viewer')),

  -- Aceptada y revocada a la vez no significa nada.
  constraint invitations_state_check
    check (accepted_at is null or revoked_at is null),

  -- Una invitacion aceptada tiene que decir por quien.
  constraint invitations_accepted_by_check
    check ((accepted_at is null) = (accepted_by is null))
);

-- El token se busca por su hash, y tiene que ser unico globalmente: dos tenants
-- no pueden compartir token ni por accidente.
create unique index if not exists invitations_token_key
  on public.invitations (token_hash);

-- Una direccion no puede tener dos invitaciones VIVAS en la misma empresa.
-- Parcial a proposito: aceptada o revocada, la fila se queda como historico y no
-- deberia estorbar a una invitacion nueva.
create unique index if not exists invitations_pending_key
  on public.invitations (tenant_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index if not exists invitations_tenant_idx
  on public.invitations (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Politicas
--
-- Las gestionan owner y admin, y solo dentro de su tenant. Aceptar NO pasa por
-- aqui: quien acepta todavia no es miembro, asi que `app.is_member()` es falso
-- para el y ninguna politica le dejaria ver la fila. Ese camino va por la
-- funcion de abajo.
-- ---------------------------------------------------------------------------
alter table public.invitations enable row level security;
alter table public.invitations force row level security;

drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (tenant_id = app.current_tenant() and app.is_admin());

drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations for insert to authenticated
  with check (tenant_id = app.current_tenant() and app.is_admin());

drop policy if exists invitations_update on public.invitations;
create policy invitations_update on public.invitations for update to authenticated
  using (tenant_id = app.current_tenant() and app.is_admin())
  with check (tenant_id = app.current_tenant() and app.is_admin());

-- No se borran: revocar deja rastro, borrar lo elimina. Quien pregunte manana
-- "quien invito a esta persona" merece una respuesta.
drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations for delete to authenticated
  using (false);

grant select, insert, update on public.invitations to authenticated;

/**
 * Acepta una invitacion y crea la pertenencia.
 *
 * SECURITY DEFINER porque quien la llama todavia NO pertenece al tenant: para el,
 * `app.is_member()` es falso y ninguna politica le deja ni leer la fila que le
 * invita. Es el mismo caso que el alta de empresa.
 *
 * Recibe el token en claro y lo compara por hash. Nunca devuelve el token, ni
 * mensajes distintos segun donde falle: "no vale" cubre caducada, revocada, ya
 * usada e inexistente. Distinguirlas convertiria esta funcion en un comprobador
 * de invitaciones ajenas.
 *
 * NO comprueba la cuota de usuarios. Es deliberado y merece explicarse: la plaza
 * se reserva al INVITAR, no al aceptar. Si se comprobara aqui, alguien que
 * acepta una invitacion legitima de hace dos dias podria encontrarse rechazado
 * porque entre medias entro otro — y no tendria forma de entender por que. El
 * caso de uso que crea la invitacion es quien mira el limite.
 */
create or replace function app.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_email  text;
  v_row    public.invitations;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED: hace falta una sesion para aceptar una invitacion'
      using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = v_user;

  select * into v_row
    from public.invitations
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
   for update;

  if v_row.id is null then
    raise exception 'INVALID_INVITATION: la invitacion no es valida' using errcode = 'P0001';
  end if;

  -- La invitacion es para una direccion concreta. Sin esta comprobacion, un
  -- enlace reenviado por descuido dejaria entrar a quien no estaba invitado.
  if lower(coalesce(v_email, '')) <> lower(v_row.email) then
    raise exception 'INVALID_INVITATION: la invitacion no es valida' using errcode = 'P0001';
  end if;

  -- Ya era miembro: se consume la invitacion y se sigue. Fallar aqui obligaria a
  -- explicar una situacion que a quien la vive le da exactamente igual.
  if not exists (
    select 1 from public.memberships m
     where m.tenant_id = v_row.tenant_id and m.user_id = v_user
  ) then
    insert into public.memberships (tenant_id, user_id, role, status)
    values (v_row.tenant_id, v_user, v_row.role, 'active');
  end if;

  update public.invitations
     set accepted_at = now(), accepted_by = v_user
   where id = v_row.id;

  return v_row.tenant_id;
end $fn$;

revoke all on function app.accept_invitation(text) from public;
grant execute on function app.accept_invitation(text) to authenticated;

/**
 * Lo que se puede contar de una invitacion ANTES de aceptarla.
 *
 * La pantalla necesita decir "te invitan a Panaderia Santa Rosa como vendedor"
 * para que quien llega desde un correo sepa que esta a punto de aceptar. Sin
 * esto tendria que pulsar a ciegas.
 *
 * Devuelve el nombre del tenant y el rol, y nada mas: ni el correo invitado, ni
 * quien invito, ni el identificador. Con un token valido en la mano ya se sabe
 * todo eso; con uno invalido no se aprende nada, porque devuelve cero filas.
 */
create or replace function app.invitation_preview(p_token text)
returns table (tenant_name text, role text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.name, i.role, i.expires_at
    from public.invitations i
    join public.tenants t on t.id = i.tenant_id
   where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and i.accepted_at is null
     and i.revoked_at is null
     and i.expires_at > now()
$$;

revoke all on function app.invitation_preview(text) from public;
grant execute on function app.invitation_preview(text) to authenticated;

/**
 * Libera las plazas de las invitaciones caducadas.
 *
 * La plaza se reserva al invitar, asi que una invitacion que nadie acepto
 * mantendria ocupado un hueco del plan para siempre. La llama el mismo cron que
 * purga los sandboxes.
 */
create or replace function app.release_expired_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_released integer := 0;
  r record;
begin
  for r in
    select id, tenant_id from public.invitations
     where accepted_at is null and revoked_at is null and expires_at <= now()
     for update
  loop
    update public.invitations set revoked_at = now() where id = r.id;

    update public.tenant_usage
       set count = greatest(0, count - 1)
     where tenant_id = r.tenant_id and resource = 'users' and period = 'total';

    v_released := v_released + 1;
  end loop;

  return v_released;
end $fn$;

revoke all on function app.release_expired_invitations() from public;
