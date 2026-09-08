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

export async function GET(): Promise<Response> {
  const res = await fetch(`${apiBaseUrl()}/health`, {
    cache: 'no-store',
    /*
     * Corto A PROPOSITO, y es lo contrario de lo que hace el resto de la aplicacion.
     * Aqui no se espera a que despierte: se PREGUNTA si ya lo esta. Un sondeo que
     * tarda cuarenta segundos en decir que no deja la pantalla muda justo cuando
     * tiene que ir contando.
     */
    signal: AbortSignal.timeout(4_000),
  }).catch(() => null);

  return Response.json(
    { ready: res !== null && res.ok },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
