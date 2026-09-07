import { sql } from 'drizzle-orm';
import { getDatabase } from '@corebiz/db';
import { asUser } from './session';

/**
 * Los dos pasos de aceptar una invitacion.
 *
 * Viven fuera del Unit of Work porque quien acepta TODAVIA NO PERTENECE al
 * tenant: para el, `app.is_member()` es falso, no hay contexto de tenant que
 * establecer y ninguna politica le deja siquiera ver la fila que le invita. Es
 * el mismo caso que el alta de empresa.
 *
 * Ambos entran por funciones SQL acotadas que reciben el token en claro y lo
 * comparan por hash. El token nunca se busca desde TypeScript ni se compara aqui:
 * si la comparacion viviera en la aplicacion, haria falta poder LEER el hash
 * guardado, y eso significaria exponer la tabla.
 */

export interface InvitationPreview {
  readonly tenantName: string;
  readonly role: string;
  readonly expiresAt: Date;
}

/**
 * Lo que se le puede contar a alguien antes de que acepte.
 *
 * Devuelve null para un token invalido, caducado, revocado o ya usado — los
 * cuatro casos indistinguibles a proposito. Con un token valido en la mano ya se
 * sabe todo esto; con uno invalido no se aprende nada.
 */
export async function previewInvitation(
  url: string,
  userId: string,
  token: string,
): Promise<InvitationPreview | null> {
  const rows = await asUser(getDatabase(url), userId, (tx) =>
    tx.execute(sql`select * from app.invitation_preview(${token})`),
  );

  const row = rows[0] as
    { tenant_name: string; role: string; expires_at: string | Date } | undefined;

  return row === undefined
    ? null
    : {
        tenantName: row.tenant_name,
        role: row.role,
        expiresAt: new Date(row.expires_at),
      };
}

export type AcceptInvitationResult =
  { ok: true; tenantId: string } | { ok: false; error: 'INVALID_INVITATION' | 'UNKNOWN' };

/**
 * Acepta la invitacion y crea la pertenencia.
 *
 * La funcion SQL comprueba ademas que el correo de la sesion coincida con el
 * invitado. Sin esa comprobacion, un enlace reenviado por descuido —o publicado
 * en un chat de equipo— dejaria entrar a quien lo abriese primero.
 */
export async function acceptInvitation(
  url: string,
  userId: string,
  token: string,
): Promise<AcceptInvitationResult> {
  try {
    const rows = await asUser(getDatabase(url), userId, (tx) =>
      tx.execute(sql`select app.accept_invitation(${token}) as tenant_id`),
    );

    const tenantId = (rows[0] as { tenant_id: string } | undefined)?.tenant_id;
    return tenantId === undefined ? { ok: false, error: 'UNKNOWN' } : { ok: true, tenantId };
  } catch (error) {
    const parts: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    }

    return parts.join(' | ').includes('INVALID_INVITATION')
      ? { ok: false, error: 'INVALID_INVITATION' }
      : { ok: false, error: 'UNKNOWN' };
  }
}
