'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabaseServer, ACTIVE_TENANT_COOKIE } from '@/auth/supabase';
import { clientFingerprint } from '@/auth/request-identity';
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
    }
  | { status: 'error'; errorKind: 'TooManyAttempts' | 'Unavailable'; retryAfter?: number };

export async function startDemoAction(_prev: DemoState, _formData: FormData): Promise<DemoState> {
  // La misma variable que cierra la puerta en el resto del sistema. Se comprueba
  // tambien aqui y no solo al pintar la pagina: una Server Action es un endpoint,
  // y se puede invocar sin haber pasado por su formulario.
  if (!demoConfig.enabled()) redirect('/login');

  const fingerprint = await clientFingerprint();

  /*
   * El limite por origen y el aprovisionamiento viajan JUNTOS en una sola llamada.
   *
   * Podrian ir separados —pedir permiso y luego crear— y seria peor: entre las dos
   * llamadas cabe una tercera peticion, y el limite dejaria de contar lo que
   * pretende. Que la API haga las dos cosas seguidas es lo que lo mantiene honesto.
   *
   * El hash del origen SI se calcula aqui, que es el unico sitio donde
   * `x-forwarded-for` es de fiar. La IP no cruza el cable.
   */
  const result = await startDemoSandbox(fingerprint);

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
  };
}
