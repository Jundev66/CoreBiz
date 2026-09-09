import { describe, expect, it } from 'vitest';
import { getPrisma } from '@corebiz/db';
import { asUser, readOnly, withTenant } from '../src/prisma/session';
import { createTestTenant, dropTestTenant } from './support/database';

/**
 * El contexto de empresa es LOCAL a la transaccion.
 *
 * Es la prueba mas barata que existe del fallo mas caro: si `set_config` se hiciera con
 * alcance de sesion en lugar de local, la variable quedaria pegada a la conexion del pool
 * y la heredaria el siguiente request — que puede ser de otra empresa. Ese fallo no da
 * error: da datos de otro. Aqui se comprueba en el sitio barato, antes de que haga falta
 * concurrencia para verlo.
 */

const URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function leerContexto(tx: {
  $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T>;
}): Promise<{ tenant: string | null; rol: string }> {
  const filas = await tx.$queryRaw<{ tenant: string | null; rol: string }[]>`
    select nullif(current_setting('app.tenant_id', true), '') as tenant,
           current_user as rol
  `;
  return filas[0]!;
}

describe('la sesion de Prisma', () => {
  it('pone la empresa y el rol DENTRO de la transaccion, y no fuera', async () => {
    const prisma = getPrisma(URL);
    const { tenantId, ctx } = await createTestTenant({});

    try {
      const dentro = await withTenant(prisma, ctx, (tx) => leerContexto(tx));
      expect(dentro.tenant).toBe(tenantId);
      expect(dentro.rol).toBe('authenticated');

      // Y ahora la mitad que de verdad importa: la MISMA conexion, ya fuera de aquella
      // transaccion, no debe recordar nada. Sin `local`, esto devolveria el tenant
      // anterior y la fuga estaria servida.
      const fuera = await prisma.$queryRaw<{ tenant: string | null; rol: string }[]>`
        select nullif(current_setting('app.tenant_id', true), '') as tenant,
               current_user as rol
      `;
      expect(fuera[0]!.tenant).toBeNull();
      expect(fuera[0]!.rol).not.toBe('authenticated');
    } finally {
      await dropTestTenant(tenantId);
    }
  });

  it('una lectura no puede escribir, y lo impide la base de datos', async () => {
    const prisma = getPrisma(URL);
    const { tenantId, ctx } = await createTestTenant({});

    try {
      await expect(
        readOnly(prisma, ctx, async (tx) => {
          await tx.$executeRaw`insert into public.customers (id, tenant_id, code, name) values (gen_random_uuid(), ${tenantId}::uuid, 'X', 'Y')`;
        }),
      ).rejects.toThrow(/read-only|solo lectura/i);
    } finally {
      await dropTestTenant(tenantId);
    }
  });

  it('asUser deja identidad pero NINGUNA empresa activa', async () => {
    const prisma = getPrisma(URL);
    const { tenantId, userId } = await createTestTenant({});

    try {
      const visto = await asUser(prisma, userId, (tx) => leerContexto(tx));
      expect(visto.rol).toBe('authenticated');
      expect(visto.tenant).toBeNull();
    } finally {
      await dropTestTenant(tenantId);
    }
  });
});
