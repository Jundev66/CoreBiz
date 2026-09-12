'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiForRequest } from '@/api/session';
import { toFormFailure } from '@/api/failure';
import { formRejection } from './field-errors';

/**
 * Server Actions del modulo de administracion.
 *
 * Ninguna comprueba permisos por su cuenta: los comprueba el caso de uso. Es la
 * misma regla que en el resto del proyecto y aqui se nota mas que en ningun
 * otro sitio — estas acciones cambian quien puede entrar y con que papel, y una
 * pantalla que oculta el boton no impide nada a quien invoque la accion a mano.
 */

export interface AdminState {
  readonly status: 'idle' | 'success' | 'error';
  readonly errorKind?: string;
  readonly errorParams?: Readonly<Record<string, string | number>>;
  /**
   * Enlace de invitacion recien creado.
   *
   * Se devuelve UNA vez y no se puede volver a consultar: el token solo existe
   * aqui y en la URL. Si se pierde, la invitacion se revoca y se manda otra.
   */
  readonly invitationUrl?: string;
}

const failure = toFormFailure;

// ─── Invitaciones ────────────────────────────────────────────────────────────

const inviteInput = z.object({
  email: z.string().trim().toLowerCase(),
  role: z.enum(['admin', 'sales', 'warehouse', 'viewer']),
});

export async function inviteUserAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = inviteInput.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat', ...(await formRejection()) };
  }

  const { inviteUser } = await apiForRequest();
  const result = await inviteUser(parsed.data);

  if (!result.ok) return failure(result.error);

  // El enlace se compone con el origen de ESTA peticion. Tomarlo de una variable
  // de entorno funcionaria en produccion y daria un enlace roto en cualquier
  // despliegue de vista previa, que es justo donde se prueban estas cosas.
  const origin =
    (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  revalidatePath('/settings/team');

  return {
    status: 'success',
    invitationUrl: `${origin}/invitations/accept?token=${encodeURIComponent(result.value.token)}`,
  };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const id = formData.get('invitationId');
  if (typeof id !== 'string') return;

  const { revokeInvitation } = await apiForRequest();
  await revokeInvitation(id);

  revalidatePath('/settings/team');
}

// ─── Equipo ──────────────────────────────────────────────────────────────────

export async function changeMemberRoleAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const userId = formData.get('userId');
  const role = formData.get('role');
  if (typeof userId !== 'string' || typeof role !== 'string') {
    return { status: 'error', errorKind: 'InvalidFormat', ...(await formRejection()) };
  }

  const { changeMemberRole } = await apiForRequest();
  const result = await changeMemberRole({ userId, role });

  if (!result.ok) return failure(result.error);

  revalidatePath('/settings/team');
  return { status: 'success' };
}

export async function removeMemberAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const userId = formData.get('userId');
  if (typeof userId !== 'string') {
    return { status: 'error', errorKind: 'InvalidFormat', ...(await formRejection()) };
  }

  const { removeMember } = await apiForRequest();
  const result = await removeMember(userId);

  if (!result.ok) return failure(result.error);

  revalidatePath('/settings/team');
  return { status: 'success' };
}

// ─── Ajustes de la empresa ───────────────────────────────────────────────────

const settingsInput = z.object({
  name: z.string().trim().optional(),
  taxLabel: z.string().trim().optional(),
  // Llega como porcentaje porque es lo que una persona escribe. Se convierte a
  // puntos basicos aqui, en el borde, para que el dominio no tenga que saber que
  // formato usaba el formulario.
  taxRatePercent: z.string().trim().optional(),
  baseCurrency: z.enum(['USD', 'VES']).optional(),
  exchangeRate: z.string().trim().optional(),
});

export async function updateTenantSettingsAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = settingsInput.safeParse({
    name: formData.get('name') ?? undefined,
    taxLabel: formData.get('taxLabel') ?? undefined,
    taxRatePercent: formData.get('taxRatePercent') ?? undefined,
    baseCurrency: formData.get('baseCurrency') ?? undefined,
    exchangeRate: formData.get('exchangeRate') ?? undefined,
  });
  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat', ...(await formRejection()) };
  }

  let taxRateBp: number | undefined;
  if (parsed.data.taxRatePercent !== undefined && parsed.data.taxRatePercent !== '') {
    // La coma decimal es lo normal en español; aceptarla evita que "16,5" acabe
    // interpretado como 16 sin que nadie se entere.
    const percent = Number(parsed.data.taxRatePercent.replace(',', '.'));
    if (!Number.isFinite(percent)) {
      return { status: 'error', errorKind: 'InvalidTaxRate' };
    }
    taxRateBp = Math.round(percent * 100);
  }

  const { updateTenantSettings } = await apiForRequest();
  const result = await updateTenantSettings({
    ...(parsed.data.name !== undefined && parsed.data.name !== ''
      ? { name: parsed.data.name }
      : {}),
    ...(parsed.data.taxLabel !== undefined && parsed.data.taxLabel !== ''
      ? { taxLabel: parsed.data.taxLabel }
      : {}),
    ...(taxRateBp !== undefined ? { taxRateBp } : {}),
    ...(parsed.data.baseCurrency !== undefined ? { baseCurrency: parsed.data.baseCurrency } : {}),
    ...(parsed.data.exchangeRate !== undefined && parsed.data.exchangeRate !== ''
      ? { exchangeRate: parsed.data.exchangeRate.replace(',', '.') }
      : {}),
  });

  if (!result.ok) return failure(result.error);

  // Los ajustes cambian lo que se pinta en TODA la aplicacion: la etiqueta del
  // impuesto sale en cada nota, y la moneda base en cada precio.
  revalidatePath('/', 'layout');
  return { status: 'success' };
}
