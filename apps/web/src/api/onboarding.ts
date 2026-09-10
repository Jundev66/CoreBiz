import 'server-only';
import { apiBaseUrl, type ApiErrorBody } from './client';

/**
 * Llamadas del alta, con el token PASADO A MANO.
 *
 * No usan el cliente normal, y la razon es concreta: estas dos ocurren en el mismo
 * instante en que la sesion se acaba de crear. El cliente normal saca el token
 * leyendo las cookies de la peticion, y en ese momento la cookie que Supabase acaba de
 * escribir todavia esta en la respuesta y no en la peticion. Pasar el token que la
 * propia llamada a Supabase devolvio quita esa carrera de encima.
 */

export type ProvisionOutcome =
  { readonly ok: true; readonly tenantId: string } | { readonly ok: false; readonly error: string };

async function post(token: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  });
}

async function outcome(res: Response): Promise<ProvisionOutcome> {
  if (res.ok) {
    const body = (await res.json()) as { tenantId: string };
    return { ok: true, tenantId: body.tenantId };
  }

  const envelope = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return { ok: false, error: envelope?.errorKind ?? 'UNKNOWN' };
}

/** Con que datos nace una empresa. Todo salvo el nombre tiene un valor razonable. */
export interface BusinessDraft {
  readonly name: string;
  readonly baseCurrency?: 'USD' | 'VES';
  readonly taxLabel?: string;
  readonly taxRateBp?: number;
  /** Decimal en texto, como se teclea: "36,50". Lo valida y escala la API. */
  readonly exchangeRate?: string;
}

/** Crea la empresa de quien acaba de registrarse, ya configurada. */
export async function provisionTenantViaApi(
  token: string,
  business: BusinessDraft,
): Promise<ProvisionOutcome> {
  return outcome(await post(token, '/v1/onboarding/tenants', business));
}

/** Acepta una invitacion y entra en la empresa que invito. */
export async function acceptInvitationViaApi(
  token: string,
  invitationToken: string,
): Promise<ProvisionOutcome> {
  return outcome(await post(token, '/v1/invitations/accept', { token: invitationToken }));
}

export interface InvitationPreview {
  readonly tenantName: string;
  readonly role: string;
  readonly expiresAt: Date;
}

/**
 * Lo que se le puede contar a alguien antes de que acepte.
 *
 * Devuelve null para un token invalido, caducado, revocado o ya usado — los cuatro
 * casos indistinguibles a proposito. Con un token valido en la mano ya se sabe todo
 * esto; con uno invalido no se aprende nada.
 */
export async function previewInvitationViaApi(
  token: string,
  invitationToken: string,
): Promise<InvitationPreview | null> {
  const res = await fetch(
    `${apiBaseUrl()}/v1/invitations/preview?token=${encodeURIComponent(invitationToken)}`,
    {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    },
  ).catch(() => null);

  if (res === null || !res.ok) return null;

  const body = (await res.json()) as { tenantName: string; role: string; expiresAt: string };
  return { ...body, expiresAt: new Date(body.expiresAt) };
}
