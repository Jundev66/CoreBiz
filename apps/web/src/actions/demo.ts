'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabaseServer, ACTIVE_TENANT_COOKIE } from '@/auth/supabase';
import { forgetFailure } from '@/api/last-error';
import { clientFingerprint } from '@/auth/request-identity';
import { apiIsAwake, send } from '@/api/client';
import { startDemoSandbox } from '@/api/demo';
import { demoConfig } from '@/demo/sandbox';

/**
 * La puerta de la demostracion.
 *
 * Crear el visitante va por POST y NUNCA por el simple hecho de abrir la pagina.
 * Es la decision que mas protege el presupuesto: un GET que provisiona lo dispara
 * cualquier rastreador, cualquier previsualizacion de enlace de un chat y
 * cualquier antivirus de correo. Publicar el enlace en una red social crearia
 * decenas de cuentas y de copias de la base antes de que lo abriese una persona.
 *
 * El precio es un clic de mas para quien llega desde el CV, y esta bien pagado.
 */

export type DemoState =
  | { status: 'idle' }
  | {
      status: 'ready';
      email: string;
      password: string;
      /** Horas que le quedan de vida. En horas y no en fecha absoluta a proposito. */
      hoursLeft: number;
      readonly: boolean;
      /** `busy`: no room for another copy. `limit`: this network used its hourly copies. */
      readonlyReason: 'busy' | 'limit' | null;
    }
  | { status: 'error'; errorKind: 'TooManyAttempts' | 'Unavailable'; retryAfter?: number };

/**
 * Leaves an expired demo and goes back to the start button.
 *
 * Same sign-out as `signOutAction` — this session only, active company and last error
 * cleared — but it returns to `/demo` instead of `/login`: whoever's copy expired wants
 * another one, not a sign-in form for an account that is about to be deleted.
 */
export async function restartDemoAction(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: 'local' });
  (await cookies()).delete(ACTIVE_TENANT_COOKIE);
  await forgetFailure();
  redirect('/demo');
}

/**
 * Destruye de inmediato todos los datos de demostración, configuraciones de IA y la cuenta,
 * cerrando la sesión y redirigiendo al visitante.
 */
export async function destroyDemoAction(): Promise<void> {
  // Pide a la API que purgue inmediatamente el tenant y el usuario demo
  await send('DELETE', '/v1/session/demo').catch(() => null);

  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: 'local' });
  (await cookies()).delete(ACTIVE_TENANT_COOKIE);
  await forgetFailure();
  redirect('/demo');
}

export async function startDemoAction(_prev: DemoState, formData: FormData): Promise<DemoState> {
  // La misma variable que cierra la puerta en el resto del sistema. Se comprueba
  // tambien aqui y no solo al pintar la pagina: una Server Action es un endpoint,
  // y se puede invocar sin haber pasado por su formulario.
  if (!demoConfig.enabled()) redirect('/login');

  if (!(await apiIsAwake())) redirect('/waking-up?next=%2Fdemo');

  const rawEmail = formData?.get('email');
  const leadEmail = typeof rawEmail === 'string' && rawEmail.trim() !== '' ? rawEmail.trim() : null;

  const rawName = formData?.get('name');
  const leadName = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim() : null;

  const rawCompany = formData?.get('company');
  const leadCompany =
    typeof rawCompany === 'string' && rawCompany.trim() !== '' ? rawCompany.trim() : null;

  const fingerprint = await clientFingerprint();

  const result = await startDemoSandbox(fingerprint, {
    email: leadEmail,
    name: leadName,
    company: leadCompany,
  });

  if (!result.ok) {
    return result.errorKind === 'TooManyAttempts'
      ? {
          status: 'error',
          errorKind: 'TooManyAttempts',
          ...(result.retryAfter !== undefined ? { retryAfter: result.retryAfter } : {}),
        }
      : { status: 'error', errorKind: 'Unavailable' };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: result.email,
    password: result.password,
  });

  // Si el acceso falla justo despues de crear la cuenta, queda un visitante
  // provisionado que nadie va a usar. No se limpia aqui a mano: lleva la misma
  // caducidad que los demas y se lo lleva la purga en 24 horas. Escribir una
  // compensacion para un caso que solo ocurre si GoTrue esta caido anadiria un
  // camino de borrado mas —y los caminos de borrado son justo los que hay que
  // tener contados.
  if (error !== null) return { status: 'error', errorKind: 'Unavailable' };

  // Si el navegador traia un tenant activo de una sesion anterior, apuntaria a
  // una empresa que este visitante no tiene.
  (await cookies()).delete(ACTIVE_TENANT_COOKIE);

  return {
    status: 'ready',
    email: result.email,
    password: result.password,
    hoursLeft: result.hoursLeft,
    readonly: result.readonly,
    readonlyReason: result.readonlyReason,
  };
}
