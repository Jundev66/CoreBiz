import { describe, it, expect, beforeEach } from 'vitest';
import { Plan, asId, type TenantId, type UserId } from '@corebiz/domain';
import {
  InMemoryMembershipRepository,
  InMemoryUnitOfWork,
  createSalesStores,
  makeTestContext,
  stubTokenFactory,
  type SalesStores,
} from '../../adapters/memory/index';
import { fixedClock } from '../../ports/clock';
import { sequentialIdGenerator } from '../../ports/id-generator';
import { makeInviteUser } from './invite-user';
import { makeChangeMemberRole, makeRemoveMember, makeRevokeInvitation } from './manage-team';
import { makeUpdateTenantSettings } from './update-tenant-settings';

const TENANT = asId<TenantId>('tenant-test');
const OWNER = asId<UserId>('user-test');
const OTHER = asId<UserId>('user-otro');
const NOW = new Date('2026-09-06T12:00:00.000Z');

describe('Modulo de administracion', () => {
  let stores: SalesStores;
  let uow: InMemoryUnitOfWork;

  /** Deja al propietario dentro, igual que hace el alta de empresa. */
  function seedOwner(role: 'owner' | 'admin' | 'sales' = 'owner'): void {
    new InMemoryMembershipRepository(stores.members as never, TENANT).seed({
      userId: OWNER,
      email: 'duena@corebiz.test',
      role,
      status: 'active',
      joinedAt: NOW,
    });
    stores.usage.set(`${TENANT}:users`, 1);
  }

  beforeEach(() => {
    stores = createSalesStores();
    uow = new InMemoryUnitOfWork(stores, stores.usage, TENANT);
  });

  const invite = (ctx = makeTestContext()) =>
    makeInviteUser({
      uow,
      ctx,
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('inv'),
      tokens: stubTokenFactory(),
    });

  // ─── Invitar ───────────────────────────────────────────────────────────────

  describe('inviteUser', () => {
    beforeEach(seedOwner);

    it('crea la invitacion y devuelve el token una sola vez', async () => {
      const result = await invite()({ email: ' Nueva@Corebiz.TEST ', role: 'sales' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // El correo se normaliza: dos invitaciones al mismo buzon escrito distinto
      // serian dos plazas gastadas por la misma persona.
      expect(result.value.email).toBe('nueva@corebiz.test');
      expect(result.value.token).toBe('token-1');
    });

    it('NUNCA guarda el token en claro', async () => {
      const result = await invite()({ email: 'nueva@corebiz.test', role: 'sales' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const stored = [...stores.invitations.values()] as { tokenHash: string }[];

      // Es la aserción central de todo el modulo. Un token de invitacion es una
      // credencial: guardarlo legible convierte cualquier lectura de esa tabla
      // —una copia de seguridad, un volcado— en una entrada a la empresa.
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).not.toBe(result.value.token);
      expect(stored[0]?.tokenHash).toContain('sha256:');
    });

    it('no deja el token en el registro de auditoria', async () => {
      const result = await invite()({ email: 'nueva@corebiz.test', role: 'sales' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // La auditoria se consulta y se EXPORTA. Un token ahi dentro seria una
      // credencial viajando en un CSV.
      const registrado = JSON.stringify(uow.audit.entries);
      expect(registrado).toContain('user.invited');
      expect(registrado).not.toContain(result.value.token);
    });

    it('consume una plaza del plan al invitar, no al aceptar', async () => {
      await invite()({ email: 'nueva@corebiz.test', role: 'sales' });

      // Reservar al invitar mueve el "no" al unico momento en el que quien
      // invita puede reaccionar. Con la plaza cobrada al aceptar, la persona
      // invitada se encontraria rechazada dos dias despues y sin nada que hacer.
      expect(stores.usage.get(`${TENANT}:users`)).toBe(2);
    });

    it('bloquea cuando el plan gratuito se queda sin plazas', async () => {
      // El plan FREE admite 2. Con la duena dentro y una invitacion viva, la
      // siguiente no cabe.
      await invite()({ email: 'primera@corebiz.test', role: 'sales' });
      const result = await invite()({ email: 'segunda@corebiz.test', role: 'sales' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({ kind: 'QuotaExceeded', resource: 'users', limit: 2 });

      // Y no deja rastro: ni invitacion, ni plaza consumida de mas.
      expect(stores.invitations.size).toBe(1);
      expect(stores.usage.get(`${TENANT}:users`)).toBe(2);
    });

    it('el plan PRO levanta el limite sin tocar el codigo', async () => {
      const pro = makeTestContext({ plan: Plan.of('pro') });

      await invite(pro)({ email: 'a@corebiz.test', role: 'sales' });
      const result = await invite(pro)({ email: 'b@corebiz.test', role: 'sales' });

      expect(result.ok).toBe(true);
    });

    it('rechaza a quien no tiene permiso, aunque llame directamente', async () => {
      const vendedor = makeTestContext({ actor: { userId: OWNER, role: 'sales' } });
      const result = await invite(vendedor)({ email: 'nueva@corebiz.test', role: 'viewer' });

      // El bloqueo viene del caso de uso y no de que la pantalla oculte el
      // formulario: esta llamada es exactamente la que haria alguien invocando
      // la Server Action a mano.
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('Forbidden');
    });

    it('no admite invitar a alguien como dueno', async () => {
      const result = await invite()({ email: 'nueva@corebiz.test', role: 'owner' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('CannotInviteOwner');
    });

    it('no admite dos invitaciones vivas al mismo correo', async () => {
      await invite()({ email: 'nueva@corebiz.test', role: 'sales' });
      const repeat = await invite()({ email: 'NUEVA@corebiz.test', role: 'viewer' });

      expect(repeat.ok).toBe(false);
      if (!repeat.ok) expect(repeat.error.kind).toBe('AlreadyInvited');
    });

    it('no invita a quien ya trabaja en la empresa', async () => {
      const result = await invite()({ email: 'duena@corebiz.test', role: 'viewer' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('AlreadyMember');
    });

    it('rechaza un correo que no lo es', async () => {
      const result = await invite()({ email: 'esto-no-es-un-correo', role: 'sales' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('InvalidEmail');
    });
  });

  // ─── Revocar ───────────────────────────────────────────────────────────────

  describe('revokeInvitation', () => {
    beforeEach(seedOwner);

    it('devuelve la plaza al plan', async () => {
      const created = await invite()({ email: 'nueva@corebiz.test', role: 'sales' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      expect(stores.usage.get(`${TENANT}:users`)).toBe(2);

      const revoke = makeRevokeInvitation({ uow, ctx: makeTestContext() });
      const result = await revoke(created.value.id);

      expect(result.ok).toBe(true);
      // Sin esto, una invitacion olvidada retendria la plaza para siempre.
      expect(stores.usage.get(`${TENANT}:users`)).toBe(1);
    });

    it('no revuelve nada si la invitacion ya no esta viva', async () => {
      const revoke = makeRevokeInvitation({ uow, ctx: makeTestContext() });
      const result = await revoke('no-existe');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('InvitationNotFound');
      expect(stores.usage.get(`${TENANT}:users`)).toBe(1);
    });
  });

  // ─── Roles ─────────────────────────────────────────────────────────────────

  describe('changeMemberRole', () => {
    function seedSecondPerson(role: 'sales' | 'owner' = 'sales'): void {
      new InMemoryMembershipRepository(stores.members as never, TENANT).seed({
        userId: OTHER,
        email: 'otra@corebiz.test',
        role,
        status: 'active',
        joinedAt: NOW,
      });
    }

    beforeEach(() => {
      seedOwner();
      seedSecondPerson();
    });

    it('cambia el rol y lo deja registrado', async () => {
      const change = makeChangeMemberRole({ uow, ctx: makeTestContext() });
      const result = await change({ userId: OTHER, role: 'admin' });

      expect(result.ok).toBe(true);
      expect(JSON.stringify(uow.audit.entries)).toContain('user.role_changed');
    });

    it('impide dejar la empresa sin dueno', async () => {
      const change = makeChangeMemberRole({ uow, ctx: makeTestContext() });
      const result = await change({ userId: OWNER, role: 'viewer' });

      // La regla la impone la base de datos con un trigger; el doble en memoria
      // la imita para que este caso se pueda probar sin levantar Postgres. El
      // caso de uso solo traduce la excepcion a un error con nombre.
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('LastOwner');
    });

    it('un administrador no puede nombrar duenos', async () => {
      const admin = makeChangeMemberRole({
        uow,
        ctx: makeTestContext({ actor: { userId: OWNER, role: 'admin' } }),
      });
      const result = await admin({ userId: OTHER, role: 'owner' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('OnlyOwnerGrantsOwnership');
    });

    it('rechaza un rol que no existe', async () => {
      const change = makeChangeMemberRole({ uow, ctx: makeTestContext() });
      const result = await change({ userId: OTHER, role: 'superusuario' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('UnknownRole');
    });

    it('cambiar al mismo rol no ensucia la auditoria', async () => {
      const change = makeChangeMemberRole({ uow, ctx: makeTestContext() });
      const result = await change({ userId: OTHER, role: 'sales' });

      expect(result.ok).toBe(true);
      expect(uow.audit.entries).toHaveLength(0);
    });
  });

  describe('removeMember', () => {
    beforeEach(() => {
      seedOwner();
      new InMemoryMembershipRepository(stores.members as never, TENANT).seed({
        userId: OTHER,
        email: 'otra@corebiz.test',
        role: 'sales',
        status: 'active',
        joinedAt: NOW,
      });
      stores.usage.set(`${TENANT}:users`, 2);
    });

    it('libera la plaza al sacar a alguien', async () => {
      const remove = makeRemoveMember({ uow, ctx: makeTestContext() });
      const result = await remove(OTHER);

      expect(result.ok).toBe(true);
      // Sin esto, un equipo que rota acabaria bloqueado por gente que ya no esta.
      expect(stores.usage.get(`${TENANT}:users`)).toBe(1);
    });

    it('no deja que alguien se quite a si mismo', async () => {
      const remove = makeRemoveMember({ uow, ctx: makeTestContext() });
      const result = await remove(OWNER);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('CannotRemoveSelf');
    });
  });

  // ─── Ajustes ───────────────────────────────────────────────────────────────

  describe('updateTenantSettings', () => {
    const update = (ctx = makeTestContext()) =>
      makeUpdateTenantSettings({ uow, ctx, clock: fixedClock(NOW) });

    it('convierte la tasa a la escala del dominio y guarda cuando se capturo', async () => {
      const result = await update()({ exchangeRate: '36.50' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.exchangeRateScaled).toBe(3_650_000_000n);
      // La fecha va junto a la tasa: sin ella, el dato invita a leerse como "la
      // tasa de hoy", que es justo lo que deja de ser manana.
      expect(result.value.exchangeRateAt).toEqual(NOW);
    });

    it('rechaza una tasa que no es un numero positivo', async () => {
      for (const raw of ['0', '-5', 'gratis']) {
        const result = await update()({ exchangeRate: raw });
        expect(result.ok, raw).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('InvalidExchangeRate');
      }
    });

    it('rechaza un impuesto fuera de rango', async () => {
      // 10000 puntos basicos es el 100 %. Por encima casi siempre es alguien
      // escribiendo el porcentaje donde iban los puntos basicos.
      const result = await update()({ taxRateBp: 20_000 });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('InvalidTaxRate');
    });

    it('solo escribe los campos enviados', async () => {
      const result = await update()({ taxLabel: 'Impuesto informativo (16%)' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Un patch con todo el objeto pondria a null lo que el formulario no
      // envio: en unos ajustes, la diferencia entre cambiar la tasa y borrar la
      // moneda base.
      expect(Object.keys(result.value)).toEqual(['taxLabel']);
    });

    it('un vendedor no cambia los ajustes de la empresa', async () => {
      const vendedor = makeTestContext({ actor: { userId: OWNER, role: 'sales' } });
      const result = await update(vendedor)({ taxRateBp: 800 });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('Forbidden');
    });
  });
});
