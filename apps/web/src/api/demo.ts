import 'server-only';
import { apiBaseUrl, type ApiErrorBody } from './client';

/**
 * Pide un sandbox de demostracion.
 *
 * No usa el cliente normal porque este endpoint NO lleva sesion: existe justamente
 * para dar credenciales a quien todavia no tiene ninguna. Lo que lo protege es el
 * limitador por origen, que corre al otro lado en la misma llamada.
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
  const res = await fetch(`${apiBaseUrl()}/v1/demo/sandboxes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
