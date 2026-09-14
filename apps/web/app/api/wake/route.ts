import { apiBaseUrl } from '@/api/client';

/**
 * ¿Ya esta despierta la API?
 *
 * The wait screen queries it from the browser. It is its own route instead of calling the
 * API from the client for two reasons, and the second is the one that matters: the content
 * security policy does not allow connections to another origin, and opening `connect-src`
 * to the API would admit that the browser talks to it — exactly the boundary that keeps the
 * token in an httpOnly cookie (ADR 006).
 *
 * No devuelve nada de la respuesta de la API: solo si esta o no esta.
 */

export const dynamic = 'force-dynamic';

/**
 * One probe shared by everyone asking at the same moment.
 *
 * The route is anonymous and each call was a fresh request to the API, so a `curl` loop
 * burned invocations in both Vercel projects for free. Concurrent callers now share
 * the in-flight request and reuse its answer for a few seconds — shorter than the wait
 * screen's own polling interval, so a real visitor never sees a stale "not yet".
 */
const REUSE_MS = 1_500;

const holder = globalThis as typeof globalThis & {
  __corebizWake?: { at: number; ready: boolean; inFlight: Promise<boolean> | null };
};
holder.__corebizWake ??= { at: 0, ready: false, inFlight: null };

function probe(): Promise<boolean> {
  const state = holder.__corebizWake as {
    at: number;
    ready: boolean;
    inFlight: Promise<boolean> | null;
  };

  if (Date.now() - state.at < REUSE_MS) return Promise.resolve(state.ready);
  if (state.inFlight !== null) return state.inFlight;

  const pending = fetch(`${apiBaseUrl()}/health`, {
    cache: 'no-store',
    /*
     * Corto A PROPOSITO, y es lo contrario de lo que hace el resto de la aplicacion.
     * Aqui no se espera a que despierte: se PREGUNTA si ya lo esta. Un sondeo que
     * tarda cuarenta segundos en decir que no deja la pantalla muda justo cuando
     * tiene que ir contando.
     */
    signal: AbortSignal.timeout(4_000),
  })
    .then((res) => res.ok)
    .catch(() => false)
    .then((ready) => {
      state.at = Date.now();
      state.ready = ready;
      state.inFlight = null;
      return ready;
    });

  state.inFlight = pending;
  return pending;
}

export async function GET(): Promise<Response> {
  return Response.json({ ready: await probe() }, { headers: { 'Cache-Control': 'no-store' } });
}
