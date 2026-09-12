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

/** The RESPONSE is never cached: a cached health status is not a health status. */
export const dynamic = 'force-dynamic';

/**
 * How long a completed check is worth, and why this does not contradict the line above.
 *
 * The route is PUBLIC and waits up to 45 seconds for Render to wake up. Together that makes
 * it an amplifier: every anonymous request holds a Vercel function for that long, and the
 * free quota is drained by a `curl` loop from a single machine. No attack is needed; a
 * misconfigured monitor is enough.
 *
 * The attempt limiter cannot solve it: it lives in the API, which is exactly the piece that
 * may be asleep — it would mean asking permission to check whether it answers from the
 * thing that does not answer. And `hitRateLimit` fails OPEN on purpose.
 *
 * What can be done is not repeating the work. Within the window the route answers with the
 * last thing it learned and does not ask again; and concurrent requests share ONE in-flight
 * check instead of each opening its own. A burst of a thousand requests costs as much as one.
 *
 * The header is still `no-store`, and that is not a contradiction: what is reused is the
 * check, not the response. Nothing along the way stores an "ok" to serve later; a monitor
 * polling every minute sees fresh data, and only whoever asks ten times in ten seconds gets
 * the same value twice. The memory is per process, so on Vercel the ceiling is per
 * instance: not a global limit, but no instance can be used as a lever.
 */
const CACHE_MS = 10_000;

interface Probe {
  readonly at: number;
  readonly ok: boolean;
  readonly status: number | null;
}

/*
 * On `globalThis` rather than a module-level `let`: in development Next reloads the module
 * on every change, and a module variable would silently reset on each reload. Same pattern
 * the database pool uses.
 */
const holder = globalThis as typeof globalThis & {
  __corebizHealth?: { last: Probe | null; inFlight: Promise<Probe> | null };
};
holder.__corebizHealth ??= { last: null, inFlight: null };

async function probe(): Promise<Probe> {
  const state = holder.__corebizHealth as {
    last: Probe | null;
    inFlight: Promise<Probe> | null;
  };

  const recent = state.last;
  if (recent !== null && Date.now() - recent.at < CACHE_MS) return recent;
  if (state.inFlight !== null) return state.inFlight;

  const pending = fetch(`${apiBaseUrl()}/health`, {
    cache: 'no-store',
    // Generoso: la API puede estar despertando. Un monitor que se rinde antes de
    // que arranque reporta caidas que no existen y acaba ignorandose.
    signal: AbortSignal.timeout(45_000),
  })
    .then((res): Probe => ({ at: Date.now(), ok: res.ok, status: res.status }))
    .catch((): Probe => ({ at: Date.now(), ok: false, status: null }))
    .then((result) => {
      state.last = result;
      state.inFlight = null;
      return result;
    });

  state.inFlight = pending;
  return pending;
}

export async function GET(): Promise<Response> {
  const started = Date.now();
  const driver = activeDriver();

  if (driver === 'memory') {
    // El driver en memoria no tiene base de datos que comprobar, y decirlo es mas
    // util que inventarse un "ok" que no significa lo mismo.
    return json({ status: 'ok', driver, api: 'skipped' }, 200);
  }

  const upstream = await probe();

  if (upstream.ok) {
    return json({ status: 'ok', driver, api: 'reachable', latencyMs: Date.now() - started }, 200);
  }

  // El motivo no viaja al cliente: la respuesta de la API puede llevar detalle que
  // aqui seria reconocimiento gratis. Va al registro del servidor, donde solo lo lee
  // quien tiene acceso al despliegue.
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'health.api_unreachable',
      status: upstream.status,
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
