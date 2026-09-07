import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDatabase } from '@corebiz/db';
import { TEST_DATABASE_URL, closeTestDatabase, testDb } from './support/database';

/**
 * El cliente de base de datos se REUTILIZA.
 *
 * Este archivo existe por un fallo real que solo aparecia en produccion contra
 * Postgres: `getDatabase()` guardaba el cliente en cache unicamente cuando
 * `NODE_ENV !== 'production'`, con la intencion de que el hot reload no acumulara
 * conexiones. El efecto era el contrario — en produccion no habia cache, y cada
 * llamada abria un pool nuevo que nadie cerraba.
 *
 * En desarrollo no se nota. En un servidor de larga vida, las conexiones se
 * acumulan hasta que Postgres responde "remaining connection slots are reserved
 * for roles with the SUPERUSER attribute" y la aplicacion deja de funcionar
 * entera. Lo encontro la suite E2E, con tests que fallaban sin relacion aparente
 * entre si y siempre distintos.
 *
 * Un test unitario no lo habria visto: hay que contar conexiones DE VERDAD.
 */

afterAll(closeTestDatabase);

/** Conexiones abiertas contra esta base, excluida la del propio andamiaje. */
async function backendCount(): Promise<number> {
  const rows = await testDb().execute(sql`
    select count(*)::int as n
      from pg_stat_activity
     where datname = current_database()
       and pid <> pg_backend_pid()
  `);
  return Number((rows[0] as { n: number }).n);
}

describe('Reutilizacion del cliente de base de datos', () => {
  it('devuelve el mismo pool para la misma cadena de conexion', async () => {
    const before = await backendCount();

    // Cincuenta llamadas es lo que hace la aplicacion en un pufado de requests:
    // cada pagina monta su contenedor, y el limitador de peticiones pide el suyo.
    for (let i = 0; i < 50; i += 1) {
      await getDatabase(TEST_DATABASE_URL).execute(sql`select 1`);
    }

    const after = await backendCount();

    // Con la fuga, esto crecia de cincuenta en cincuenta hasta agotar el limite
    // de Postgres. El margen permite el pool configurado y algun backend suelto
    // del propio Supabase; lo que NO permite es crecimiento lineal.
    expect(after - before).toBeLessThanOrEqual(12);
  });

  it('no abre una conexion nueva por cada peticion', async () => {
    const first = await backendCount();
    await getDatabase(TEST_DATABASE_URL).execute(sql`select 1`);
    const second = await backendCount();
    await getDatabase(TEST_DATABASE_URL).execute(sql`select 1`);
    const third = await backendCount();

    // La segunda llamada no puede costar mas conexiones que la primera.
    expect(third - second).toBeLessThanOrEqual(Math.max(0, second - first));
  });
});
