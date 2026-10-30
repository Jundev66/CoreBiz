import { apiBaseUrl } from '@/api/client';
import { cookies } from 'next/headers';
import { ACTIVE_TENANT_COOKIE } from '@/auth/supabase';

export const dynamic = 'force-dynamic';

async function forward(
  req: Request,
  context: { readonly params: Promise<{ readonly path: readonly string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const url = new URL(req.url);
  const targetUrl = `${apiBaseUrl()}/v1/pos/${path.join('/')}${url.search}`;

  const store = await cookies();
  const tenantCookie = store.get(ACTIVE_TENANT_COOKIE)?.value;

  const incomingAuth = req.headers.get('authorization');
  const incomingTenant = req.headers.get('x-corebiz-tenant') ?? tenantCookie;

  const fwdHeaders: Record<string, string> = {
    'content-type': 'application/json',
    ...(incomingAuth ? { authorization: incomingAuth } : {}),
    ...(incomingTenant ? { 'x-corebiz-tenant': incomingTenant } : {}),
  };

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody ? await req.text() : undefined;

  const res = await fetch(targetUrl, {
    method: req.method,
    headers: fwdHeaders,
    ...(body !== undefined ? { body } : {}),
    cache: 'no-store',
  });

  const resBody = await res.text();
  return new Response(resBody, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
    },
  });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
