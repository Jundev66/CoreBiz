import { apiBaseUrl } from '@/api/client';
import { activeDriver } from '@/api/session';

/**
 * Comprobacion de salud.
 *
 * Tiene dos consumidores y conviene tenerlos presentes, porque marcan lo que
 * puede y no puede devolver:
 *
 *   1. El monitor externo que mantiene despierto el proyecto de Supabase. La
 *      capa gratuita pausa un proyecto tras siete dias sin trafico, y un
 *      proyecto pausado convierte el enlace del CV en un error. Por eso esta
 *      ruta llega HASTA la base de datos: un 200 que no consulta nada mantiene
 *      viva la funcion de Vercel y deja dormirse a Postgres, que es justo lo
 *      contrario de lo que hace falta. Ahora ademas despierta a Render de paso.
 *
 *   2. Quien depura un despliegue. Por eso dice QUE falla, no solo que algo
 *      falla.
 *
 * Desde que la persistencia vive en la API, esta ruta ya no habla con Postgres:
 * pregunta a `GET /health` de la API, que si lo hace. La cadena que se comprueba es
 * por tanto la real —Vercel, Render y Supabase, en ese orden— y no una parte de ella.
 * Un 200 aqui significa que las tres piezas estan vivas, que es lo unico que el
 * monitor externo necesita saber.
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
    return json({ status: 'ok', driver, api: 'skipped' }, 200);
  }

  const upstream = await fetch(`${apiBaseUrl()}/health`, {
    cache: 'no-store',
    // Generoso: la API puede estar despertando. Un monitor que se rinde antes de
    // que arranque reporta caidas que no existen y acaba ignorandose.
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);

  if (upstream !== null && upstream.ok) {
    return json({ status: 'ok', driver, api: 'reachable', latencyMs: Date.now() - started }, 200);
  }

  // El motivo no viaja al cliente: la respuesta de la API puede llevar detalle que
  // aqui seria reconocimiento gratis. Va al registro del servidor, donde solo lo lee
  // quien tiene acceso al despliegue.
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'health.api_unreachable',
      status: upstream?.status ?? null,
      at: new Date().toISOString(),
    }),
  );

  return json({ status: 'error', driver, api: 'unreachable' }, 503);
}

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
