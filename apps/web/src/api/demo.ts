import 'server-only';
import { apiBaseUrl, type ApiErrorBody } from './client';

/**
 * Pide un sandbox de demostracion.
 *
 * It does not use the regular client because this endpoint carries NO user session: it
 * exists precisely to hand credentials to someone who has none yet.
 *
 * What protects it is the SECRET SHARED by both deployments, like the internal endpoints.
 * It was needed: the limiter on the other side counts by an `ipHash` that travels in the
 * body, and the API is public on Render, so without a credential anyone could call it
 * directly, rotate that value and provision sandboxes in bursts — accounts and database
 * copies — against the free quota.
 *
 * `ipHash` still travels in the body and is now trustworthy: it is computed here, where
 * Vercel sets `x-forwarded-for` and the client does not.
 */

export type DemoStartResult =
  | {
      readonly ok: true;
      readonly email: string;
      readonly password: string;
      readonly hoursLeft: number;
      readonly readonly: boolean;
    }
  | {
      readonly ok: false;
      readonly errorKind: 'TooManyAttempts' | 'Unavailable';
      readonly retryAfter?: number;
    };

export async function startDemoSandbox(ipHash: string): Promise<DemoStartResult> {
  const secret = process.env.INTERNAL_API_SECRET;

  // Without the secret the API answers 404 on this route. Say "unavailable" right here
  // instead of spending a fifty-second call to find out.
  if (secret === undefined || secret === '') return { ok: false, errorKind: 'Unavailable' };

  const res = await fetch(`${apiBaseUrl()}/v1/demo/sandboxes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ ipHash }),
    cache: 'no-store',
    /*
     * El plazo mas largo de toda la aplicacion, y con motivo: esta llamada puede
     * encontrarse la API dormida —el plan gratuito de Render la duerme a los quince
     * minutos— y ademas clona la base de demostracion entera. Es justo la peticion
     * que no puede rendirse pronto, porque es la que abre quien llega desde el
     * curriculum.
     */
    signal: AbortSignal.timeout(50_000),
  }).catch(() => null);

  if (res === null) return { ok: false, errorKind: 'Unavailable' };

  if (res.ok) {
    const body = (await res.json()) as {
      email: string;
      password: string;
      hoursLeft: number;
      readonly: boolean;
    };
    return { ok: true, ...body };
  }

  const envelope = (await res.json().catch(() => null)) as ApiErrorBody | null;

  if (envelope?.errorKind === 'TooManyAttempts') {
    const retryAfter = envelope.errorParams?.retryAfter;
    return {
      ok: false,
      errorKind: 'TooManyAttempts',
      ...(typeof retryAfter === 'number' ? { retryAfter } : {}),
    };
  }

  return { ok: false, errorKind: 'Unavailable' };
}
