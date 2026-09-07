import { databaseIsReachable } from '@corebiz/infrastructure';
import { activeDriver } from '@/composition/container';

/**
 * Comprobacion de salud.
 *
 * Tiene dos consumidores y conviene tenerlos presentes, porque marcan lo que
 * puede y no puede devolver:
 *
 *   1. El monitor externo que mantiene despierto el proyecto de Supabase. La
 *      capa gratuita pausa un proyecto tras siete dias sin trafico, y un
 *      proyecto pausado convierte el enlace del CV en un error. Por eso esta
 *      ruta TOCA la base de datos: un 200 que no consulta nada mantiene viva la
 *      funcion de Vercel y deja dormirse a Postgres, que es justo lo contrario
 *      de lo que hace falta.
 *
 *   2. Quien depura un despliegue. Por eso dice QUE falla, no solo que algo
 *      falla.
 *
 * Lo que NO devuelve: version del framework, cadenas de conexion, nombres de
 * host, conteos de filas. Un endpoint de salud es publico por definicion, y todo
 * lo que diga de mas es reconocimiento gratis para quien esta mirando.
 */

/** Nunca se cachea: un estado de salud cacheado no es un estado de salud. */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const started = Date.now();
  const driver = activeDriver();

  if (driver === 'memory') {
    // `pnpm dev:nodb` no tiene base de datos que comprobar, y decirlo es mas
    // util que inventarse un "ok" que no significa lo mismo.
    return json({ status: 'ok', driver, database: 'skipped' }, 200);
  }

  const url = process.env.DATABASE_URL ?? '';
  if (url === '') {
    return json({ status: 'error', driver, database: 'unconfigured' }, 503);
  }

  if (await databaseIsReachable(url)) {
    return json(
      { status: 'ok', driver, database: 'reachable', latencyMs: Date.now() - started },
      200,
    );
  }

  // El motivo no viaja al cliente: un mensaje de Postgres puede llevar nombres
  // de host, de usuario y de esquema. Va al registro del servidor, donde solo lo
  // lee quien tiene acceso al despliegue.
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'health.database_unreachable',
      at: new Date().toISOString(),
    }),
  );

  return json({ status: 'error', driver, database: 'unreachable' }, 503);
}

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
