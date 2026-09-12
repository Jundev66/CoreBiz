import { apiBaseUrl } from '@/api/client';

/**
 * ¿Ya esta despierta la API?
 *
 * Lo consulta la pantalla de espera desde el navegador. Existe como ruta propia y no
 * se llama a la API directamente desde el cliente por dos razones, y la segunda es la
 * que manda: la primera es que la politica de seguridad de contenido no permite
 * conexiones a otro origen, y la segunda es que abrir `connect-src` hacia Render seria
 * admitir que el navegador habla con la API — y ese es justo el limite que sostiene
 * que el token viva en una cookie httpOnly (ADR 006).
 *
 * No devuelve nada de la respuesta de la API: solo si esta o no esta.
 */

export const dynamic = 'force-dynamic';

/**
 * One probe shared by everyone asking at the same moment.
 *
 * The route is anonymous and each call was a fresh request to Render, so a `curl` loop
 * burned Vercel invocations and kept Render awake for free. Concurrent callers now share
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
