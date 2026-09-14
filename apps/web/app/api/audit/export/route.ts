import { accessTokenOrRedirect, apiBaseUrl } from '@/api/client';
import { dayParam, textParam } from '@/ui/filter-params';
import { ACTIVE_TENANT_COOKIE } from '@/auth/supabase';
import { cookies } from 'next/headers';

/**
 * Descarga del registro de auditoría en CSV.
 *
 * Es un PROXY. El archivo lo genera la API, y eso no es un detalle de organización: es
 * donde tiene que estar el límite de plan.
 *
 * Antes se generaba aquí, y el gate de `audit_export` se comprobaba aquí. Al exponer el
 * lado de lectura por HTTP, eso dejó de bastar: cualquiera con una sesión del plan
 * gratuito podía pedir `GET /v1/administration/audit?limit=5000` y armar el mismo CSV
 * a mano. Un gate delante de la puerta no sirve si hay otra puerta.
 *
 * It is still a Next route and not a direct link to the API for the same reason as the
 * rest: the token lives in an `httpOnly` cookie and never leaves here. If the browser
 * downloaded from the API, either the token would go in the URL — where it ends up written
 * in logs and histories — or CORS would open, which admits the browser talks to the API.
 * Neither.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const upstream = new URL(`${apiBaseUrl()}/v1/administration/audit/export`);

  /*
   * ONLY the declared filters are forwarded, and sanitised. Copying the whole query string
   * would let through any parameter someone added by hand; forwarding an impossible date
   * turns the download into a 400 with a JSON body, which the browser saves as if it were
   * the CSV.
   */
  const filters = {
    action: textParam(incoming.searchParams.get('action')),
    from: dayParam(incoming.searchParams.get('from')),
    to: dayParam(incoming.searchParams.get('to')),
  };
  if (filters.action !== null) upstream.searchParams.set('action', filters.action);
  if (filters.from !== null) upstream.searchParams.set('from', `${filters.from}T00:00:00.000Z`);
  // Up to the END of the day, like the screen. Sending the bare date means midnight, and
  // the CSV would have fewer rows than the table being viewed.
  if (filters.to !== null) upstream.searchParams.set('to', `${filters.to}T23:59:59.999Z`);

  const tenant = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;

  const res = await fetch(upstream, {
    headers: {
      authorization: `Bearer ${await accessTokenOrRedirect()}`,
      ...(tenant !== undefined ? { 'x-corebiz-tenant': tenant } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);

  if (res === null) {
    return Response.json({ errorKind: 'ApiUnavailable' }, { status: 503 });
  }

  // El cuerpo y el estado se devuelven tal cual, incluido el 403 con
  // `FeatureNotAvailable` dentro: es lo que la pantalla necesita para ofrecer subir de
  // plan en lugar de decir que algo falló.
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      ...(res.headers.get('content-disposition') !== null
        ? { 'Content-Disposition': res.headers.get('content-disposition') as string }
        : {}),
      'Cache-Control': 'no-store',
    },
  });
}
