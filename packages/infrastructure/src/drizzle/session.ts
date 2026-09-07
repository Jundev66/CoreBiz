import { sql } from 'drizzle-orm';
import type { Database } from '@corebiz/db';
import type { TenantContext } from '@corebiz/application';
import type { Tx } from './tx';

/**
 * Establece quien esta operando, para que las politicas RLS puedan decidir.
 *
 * Las tres sentencias son LOCALES a la transaccion, y eso es lo mas importante
 * de todo el adaptador. Con alcance de sesion, las variables quedarian pegadas a
 * la conexion, y Supavisor —el pooler, en modo transaccion— reutiliza esa misma
 * conexion para el siguiente request, que puede ser de OTRO TENANT. Seria una
 * fuga de datos entre clientes: intermitente, invisible en desarrollo y visible
 * solo bajo concurrencia. Ver docs/adr/005-aislamiento-multi-tenant.md.
 *
 * Consecuencia practica: TODO acceso a datos tiene que ir dentro de una
 * transaccion, tambien las lecturas. Fuera de una, cada sentencia confirma sola y
 * el contexto se pierde antes de que la siguiente lo necesite.
 */
export async function establishTenantContext(tx: Tx, ctx: TenantContext): Promise<void> {
  // Lo lee app.current_tenant().
  await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);

  // Lo lee auth.uid(). Es el mismo mecanismo que usa PostgREST, asi que las
  // politicas funcionan igual llamadas desde aqui que desde la API de Supabase.
  const claims = JSON.stringify({ sub: ctx.actor.userId, role: 'authenticated' });
  await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);

  // Sin cambiar de rol, la conexion opera como propietaria de las tablas. Aunque
  // `force row level security` la somete igualmente a las politicas, estas estan
  // escritas `to authenticated`: sin este cambio no aplicaria ninguna, y el
  // aislamiento seria una ilusion.
  await tx.execute(sql`set local role authenticated`);
}

/**
 * Ejecuta una lectura con el contexto del tenant puesto.
 *
 * La transaccion se marca de solo lectura antes de nada. No es una optimizacion:
 * es lo que convierte "este modelo de lectura no deberia escribir" en algo que la
 * base de datos impone. Si una consulta de listado intentara escribir por error,
 * falla en el acto en lugar de hacerlo en silencio.
 *
 * El `set transaction read only` va primero porque Postgres no admite cambiar el
 * modo de acceso despues de la primera sentencia de la transaccion.
 */
export async function readOnly<T>(
  db: Database,
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    await establishTenantContext(tx, ctx);
    return fn(tx);
  });
}

/**
 * Ejecuta con la identidad del usuario puesta, pero SIN tenant activo.
 *
 * Hace falta para las dos operaciones que ocurren antes de que exista un tenant:
 * el alta de la empresa y la consulta de "a que empresas pertenezco". Ambas se
 * apoyan en `auth.uid()`, no en `app.current_tenant()`, y por eso no pueden
 * pasar por `establishTenantContext`, que exige un contexto que todavia no hay.
 *
 * Establecer solo la identidad es lo correcto y ademas lo mas estrecho: dentro de
 * esta transaccion, `app.current_tenant()` devuelve null y toda politica que
 * dependa de el niega. Lo unico que se puede hacer aqui es llamar a las funciones
 * acotadas que la migracion expone para este momento exacto.
 */
export async function asUser<T>(
  db: Database,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
