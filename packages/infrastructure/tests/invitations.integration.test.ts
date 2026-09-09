import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getPrisma } from '@corebiz/db';
import { systemClock } from '@corebiz/application';
import { makeInviteUser } from '@corebiz/application';
import { PrismaUnitOfWork } from '../src/prisma/unit-of-work';
import { acceptInvitation, previewInvitation } from '../src/prisma/invitations-flow';
import { cryptoTokenFactory, hashInvitationToken } from '../src/crypto/tokens';
import { listMemberships, provisionTenant } from '../src/prisma/identity';
import {
  TEST_DATABASE_URL,
  closeTestDatabase,
  createTestTenant,
  dropTestTenant,
  testSql,
  testIds,
  type TestTenant,
} from './support/database';

/**
 * El flujo de aceptar una invitacion, contra Postgres.
 *
 * Es la unica parte del sistema donde alguien que NO pertenece al tenant escribe
 * en el: `app.accept_invitation()` es SECURITY DEFINER, porque para quien acepta
 * ninguna politica RLS le deja ni ver la fila que le invita. Una funcion asi es
 * la superficie mas delicada del esquema, y por eso se prueba lo que rechaza
 * antes que lo que acepta.
 */

const sql = testSql();

afterAll(closeTestDatabase);

/** Un usuario capaz de aceptar: hace falta que tenga correo, como en el alta real. */
async function newUserWithEmail(email: string): Promise<string> {
  const id = randomUUID();
  await sql`insert into auth.users (id, email) values (${id}, ${email})`;
  return id;
}

async function cleanup(userIds: readonly string[], tenantIds: readonly string[]): Promise<void> {
  for (const tenantId of tenantIds) await dropTestTenant(tenantId as never);
  for (const id of userIds) await sql`delete from auth.users where id = ${id}`;
}

const prisma = getPrisma(TEST_DATABASE_URL);

describe('Aceptar una invitacion', () => {
  let host: TestTenant;
  let invitedId: string;

  /** Crea una invitacion pasando por el caso de uso, no escribiendo la fila. */
  async function invite(email: string, role = 'sales'): Promise<{ token: string; id: string }> {
    const uow = new PrismaUnitOfWork({
      prisma,
      ctx: host.ctx,
      ids: testIds,
      clock: systemClock,
    });

    const inviteUser = makeInviteUser({
      uow,
      ctx: host.ctx,
      clock: systemClock,
      ids: testIds,
      tokens: cryptoTokenFactory(),
    });

    const result = await inviteUser({ email, role: role as never });
    if (!result.ok) throw new Error(`No se pudo invitar: ${JSON.stringify(result.error)}`);
    return { token: result.value.token, id: result.value.id };
  }

  beforeEach(async () => {
    host = await createTestTenant({ slug: `inv-${randomUUID().slice(0, 8)}` });
    invitedId = await newUserWithEmail(`invitado-${randomUUID().slice(0, 8)}@corebiz.test`);
    // El correo real del usuario recien creado, para invitar a esa direccion.
    const rows = await sql`select email from auth.users where id = ${invitedId}`;
    invitedMail = (rows[0] as { email: string }).email;
  });

  let invitedMail = '';

  it('guarda el hash del token y NUNCA el token', async () => {
    const { token } = await invite(invitedMail);

    const rows = await sql`
      select token_hash from public.invitations where tenant_id = ${host.tenantId}
    `;
    const stored = (rows[0] as { token_hash: string }).token_hash;

    expect(stored).not.toBe(token);
    // El mismo calculo que hace la funcion SQL. Si estos dos se separasen, la
    // aceptacion dejaria de funcionar sin que ningun otro test lo notase.
    expect(stored).toBe(hashInvitationToken(token));

    await cleanup([invitedId], [host.tenantId]);
  });

  it('deja entrar con el rol invitado y consume la invitacion', async () => {
    const { token } = await invite(invitedMail, 'warehouse');

    const preview = await previewInvitation(TEST_DATABASE_URL, invitedId, token);
    expect(preview).toMatchObject({ role: 'warehouse' });

    const accepted = await acceptInvitation(TEST_DATABASE_URL, invitedId, token);
    expect(accepted).toMatchObject({ ok: true, tenantId: host.tenantId });

    const memberships = await listMemberships(TEST_DATABASE_URL, invitedId);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ role: 'warehouse' });

    // Una invitacion es de UN SOLO USO. Si se pudiera reutilizar, el enlace
    // reenviado a un grupo metería a todo el grupo.
    const again = await acceptInvitation(TEST_DATABASE_URL, invitedId, token);
    expect(again).toMatchObject({ ok: false, error: 'INVALID_INVITATION' });

    await cleanup([invitedId], [host.tenantId]);
  });

  it('no deja entrar a una direccion distinta de la invitada', async () => {
    const { token } = await invite(invitedMail);
    const intruso = await newUserWithEmail(`intruso-${randomUUID().slice(0, 8)}@corebiz.test`);

    // Es el caso real: el enlace se reenvia por descuido, o se pega en un chat
    // de equipo. Sin esta comprobacion entra quien lo abra primero.
    const result = await acceptInvitation(TEST_DATABASE_URL, intruso, token);
    expect(result).toMatchObject({ ok: false, error: 'INVALID_INVITATION' });

    expect(await listMemberships(TEST_DATABASE_URL, intruso)).toHaveLength(0);

    await cleanup([invitedId, intruso], [host.tenantId]);
  });

  it('no deja entrar con una invitacion caducada', async () => {
    const { token, id } = await invite(invitedMail);

    await sql`
      update public.invitations set expires_at = now() - interval '1 minute' where id = ${id}
    `;

    expect(await previewInvitation(TEST_DATABASE_URL, invitedId, token)).toBeNull();

    const result = await acceptInvitation(TEST_DATABASE_URL, invitedId, token);
    expect(result).toMatchObject({ ok: false, error: 'INVALID_INVITATION' });

    await cleanup([invitedId], [host.tenantId]);
  });

  it('no deja entrar con una invitacion revocada', async () => {
    const { token, id } = await invite(invitedMail);

    await sql`update public.invitations set revoked_at = now() where id = ${id}`;

    const result = await acceptInvitation(TEST_DATABASE_URL, invitedId, token);
    expect(result).toMatchObject({ ok: false, error: 'INVALID_INVITATION' });

    await cleanup([invitedId], [host.tenantId]);
  });

  it('un token inventado no dice nada distinto de uno caducado', async () => {
    await invite(invitedMail);

    // Cuatro motivos de rechazo y una sola respuesta. Distinguirlos convertiria
    // la pantalla de aceptacion en un comprobador de invitaciones ajenas.
    const result = await acceptInvitation(TEST_DATABASE_URL, invitedId, 'token-inventado');
    expect(result).toMatchObject({ ok: false, error: 'INVALID_INVITATION' });

    expect(await previewInvitation(TEST_DATABASE_URL, invitedId, 'token-inventado')).toBeNull();

    await cleanup([invitedId], [host.tenantId]);
  });

  it('la vista previa no revela nada de una empresa a la que no se invito', async () => {
    // Se crea otra empresa con su propia invitacion, y se pregunta por ella con
    // el usuario equivocado. La vista previa solo mira el token, asi que lo que
    // protege es no tenerlo.
    const outsiderId = await newUserWithEmail(`fuera-${randomUUID().slice(0, 8)}@corebiz.test`);
    const provisioned = await provisionTenant(TEST_DATABASE_URL, outsiderId, {
      name: 'Empresa Ajena',
    });
    expect(provisioned.ok).toBe(true);

    const preview = await previewInvitation(TEST_DATABASE_URL, invitedId, 'no-tengo-token');
    expect(preview).toBeNull();

    await cleanup([invitedId, outsiderId], [host.tenantId, provisioned.tenantId ?? '']);
  });

  it('quien ya es miembro consume la invitacion sin duplicar la pertenencia', async () => {
    const { token } = await invite(invitedMail);

    await sql`
      insert into public.memberships (tenant_id, user_id, role, status)
      values (${host.tenantId}, ${invitedId}, 'viewer', 'active')
    `;

    // Fallar aqui obligaria a explicar una situacion que a quien la vive le da
    // exactamente igual: ya esta dentro, que era lo que queria.
    const result = await acceptInvitation(TEST_DATABASE_URL, invitedId, token);
    expect(result).toMatchObject({ ok: true });

    const rows = await sql`
      select count(*)::int as n from public.memberships
       where tenant_id = ${host.tenantId} and user_id = ${invitedId}
    `;
    expect(Number((rows[0] as { n: number }).n)).toBe(1);

    await cleanup([invitedId], [host.tenantId]);
  });
});
