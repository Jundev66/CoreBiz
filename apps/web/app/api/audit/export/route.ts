import { accessTokenOrRedirect, apiBaseUrl } from '@/api/client';
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
 * Sigue siendo una ruta de Next y no un enlace directo a la API por la misma razón que
 * el resto: el token vive en una cookie `httpOnly` y no sale de aquí. Si el navegador
 * descargara desde Render, o habría que poner el token en la URL —donde queda escrito
 * en logs e historiales— o abrir CORS, que es admitir que el navegador habla con la
 * API. Ninguna de las dos.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const upstream = new URL(`${apiBaseUrl()}/v1/administration/audit/export`);

  // Se reenvían SOLO los filtros declarados. Copiar la cadena de consulta entera
  // dejaría pasar cualquier parámetro que alguien añadiera a mano.
  for (const key of ['action', 'from', 'to']) {
    const value = incoming.searchParams.get(key);
    if (value !== null && value !== '') upstream.searchParams.set(key, value);
  }

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
