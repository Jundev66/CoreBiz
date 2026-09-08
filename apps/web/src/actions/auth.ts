'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { RATE_LIMITS } from '@corebiz/application/ports';
import { supabaseServer, ACTIVE_TENANT_COOKIE } from '@/auth/supabase';
import { clientFingerprint, hitRateLimit } from '@/auth/request-identity';
import { provisionTenantViaApi } from '@/api/onboarding';

/**
 * Server Actions de autenticacion.
 *
 * Son adaptadores primarios: traducen entre un formulario HTML y Supabase Auth.
 * Ninguna decide reglas de negocio, y ninguna confia en lo que llega del cliente
 * mas alla de validar su forma.
 *
 * Next comprueba el `Origin` de toda Server Action, asi que no hace falta un
 * token CSRF propio; lo que si hace falta —y aqui esta— es limitar los intentos,
 * porque un formulario de acceso sin limite es un diccionario esperando.
 */

export interface AuthState {
  readonly status: 'idle' | 'error' | 'sent';
  /** Clave de traduccion. El texto lo decide la interfaz segun el idioma. */
  readonly errorKind?: string;
  readonly retryAfter?: number;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Ocho es el minimo que impone Supabase por defecto. No se anaden reglas de
  // composicion —una mayuscula, un simbolo— a proposito: empujan a la gente
  // hacia "Password1!" y hacia el post-it, y las guias actuales del NIST
  // recomiendan longitud antes que teatro.
  password: z.string().min(8).max(72),
});

const signUpInput = credentials.extend({
  businessName: z.string().trim().min(2).max(80),
});

/**
 * Traduce los codigos de Zod a un vocabulario propio y corto.
 *
 * Los codigos de Zod cambian entre versiones mayores —`invalid_string` paso a
 * ser `invalid_format` en la 4— y si viajaran tal cual hasta la interfaz, una
 * actualizacion de la libreria dejaria mensajes sin traduccion en pantalla. Los
 * cuatro de aqui son los unicos que un formulario de cuenta necesita distinguir.
 */
function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || field in result) continue;

    result[field] =
      issue.code === 'too_small' ? 'tooShort' : issue.code === 'too_big' ? 'tooLong' : 'invalid';
  }

  return result;
}

/**
 * Intentos de acceso permitidos por minuto y origen.
 *
 * Es configurable por una razon concreta y legitima: la suite E2E entra decenas
 * de veces desde la MISMA maquina en menos de un minuto, y con el limite de
 * produccion —ocho— la mitad de los tests fallan por un bloqueo que en realidad
 * demuestra que el limite funciona. Un limite que no se puede relajar para
 * probarlo acaba probandose en produccion.
 *
 * El valor por defecto es el de produccion, asi que no configurar nada deja el
 * sistema protegido. La constante vive en `@corebiz/application` y no lee
 * variables de entorno a proposito: los casos de uso no conocen el despliegue.
 */
function loginLimit(fallback: number): number {
  const raw = Number(process.env.LOGIN_MAX_PER_MINUTE);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
}

/**
 * Consume un intento y devuelve el estado de bloqueo, si lo hay.
 *
 * La clave lleva el hash de la IP y NO el correo. Es deliberado: contar por
 * correo permitiria a un atacante dejar fuera a una persona concreta gastandole
 * los intentos, y ademas convertiria la respuesta en un oraculo sobre que
 * direcciones existen.
 */
async function consumeAttempt(policy: keyof typeof RATE_LIMITS): Promise<AuthState | null> {
  const { limit, windowSeconds } = RATE_LIMITS[policy];
  const decision = await hitRateLimit(
    `${policy}:${await clientFingerprint()}`,
    policy === 'login' ? loginLimit(limit) : limit,
    windowSeconds,
  );

  if (decision.allowed) return null;

  return {
    status: 'error',
    errorKind: 'TooManyAttempts',
    // `exactOptionalPropertyTypes` prohibe pasar `undefined` explicito: la clave
    // simplemente no se define cuando el limitador no sabe cuanto falta.
    ...(decision.retryAfterSeconds !== undefined ? { retryAfter: decision.retryAfterSeconds } : {}),
  };
}

// ─── Acceso ──────────────────────────────────────────────────────────────────

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const blocked = await consumeAttempt('login');
  if (blocked !== null) return blocked;

  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      errorKind: 'InvalidCredentials',
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error !== null) {
    // Un solo mensaje para "no existe ese correo" y "la contrasena no es esa".
    // Distinguirlos seria decirle a quien prueba direcciones cuales estan dadas
    // de alta, que es la mitad del trabajo de un ataque.
    return { status: 'error', errorKind: 'InvalidCredentials' };
  }

  // Al entrar se limpia el tenant activo: si venia de otra sesion, apuntaria a
  // una empresa que este usuario quiza ni siquiera tiene.
  (await cookies()).delete(ACTIVE_TENANT_COOKIE);

  redirect('/');
}

// ─── Registro ────────────────────────────────────────────────────────────────

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const blocked = await consumeAttempt('signup');
  if (blocked !== null) return blocked;

  const parsed = signUpInput.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    businessName: formData.get('businessName'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      errorKind: 'InvalidFormat',
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // El nombre del negocio viaja en los metadatos para que, si el alta exige
    // confirmar el correo, la empresa se pueda crear en el primer acceso sin
    // volver a preguntarlo. Nadie deberia tener que escribir dos veces como se
    // llama su negocio.
    options: { data: { business_name: parsed.data.businessName } },
  });

  if (error !== null) {
    return {
      status: 'error',
      errorKind: /already|registered|exists/i.test(error.message)
        ? 'EmailAlreadyRegistered'
        : 'SignUpFailed',
    };
  }

  // Sin sesion inmediata significa que Supabase mando un correo de confirmacion.
  if (data.session === null) return { status: 'sent' };

  // El token que acaba de devolver Supabase, no el de la cookie: la cookie todavia
  // esta en la respuesta y no en la peticion, asi que leerla aqui seria una carrera.
  const provisioned = await provisionTenantViaApi(
    data.session.access_token,
    parsed.data.businessName,
  );

  // `ALREADY_OWNER` no es un fallo: es el doble envio del formulario. Se sigue
  // hacia dentro como si nada, que es lo que la persona esperaba que pasara.
  if (!provisioned.ok && provisioned.error !== 'ALREADY_OWNER') {
    return { status: 'error', errorKind: 'SignUpFailed' };
  }

  redirect('/');
}

/**
 * Crea la empresa de quien ya tiene cuenta pero todavia no tiene negocio.
 *
 * Existe porque el alta puede partirse en dos: si Supabase exige confirmar el
 * correo, la cuenta se crea hoy y la primera sesion llega manana. La empresa se
 * crea entonces, con el nombre que se guardo en los metadatos o con el que se
 * escriba aqui.
 */
export async function createBusinessAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z.object({ businessName: z.string().trim().min(2).max(80) }).safeParse({
    businessName: formData.get('businessName'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      errorKind: 'InvalidFormat',
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getSession();
  if (data.session === null) redirect('/login');

  const provisioned = await provisionTenantViaApi(
    data.session.access_token,
    parsed.data.businessName,
  );

  if (!provisioned.ok && provisioned.error !== 'ALREADY_OWNER') {
    return { status: 'error', errorKind: 'SignUpFailed' };
  }

  redirect('/');
}

// ─── Recuperacion ────────────────────────────────────────────────────────────

export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const blocked = await consumeAttempt('passwordReset');
  if (blocked !== null) return blocked;

  const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get('email'));

  // Se responde "enviado" pase lo que pase, incluso con un correo mal escrito o
  // inexistente. Contestar "esa direccion no esta registrada" convertiria este
  // formulario en un buscador de cuentas.
  if (!parsed.success) return { status: 'sent' };

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/reset-password`,
  });

  return { status: 'sent' };
}

export async function updatePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z.string().min(8).max(72).safeParse(formData.get('password'));
  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat', fieldErrors: { password: 'too_small' } };
  }

  const supabase = await supabaseServer();

  // La sesion aqui viene del enlace del correo, que Supabase canjea por una
  // sesion de recuperacion. Sin ella no hay nada que actualizar: quien llegue a
  // esta accion sin haber pasado por el correo no puede cambiar ninguna clave.
  const { data } = await supabase.auth.getUser();
  if (data.user === null) return { status: 'error', errorKind: 'ResetLinkExpired' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error !== null) return { status: 'error', errorKind: 'SignUpFailed' };

  redirect('/');
}

// ─── Salida ──────────────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  const supabase = await supabaseServer();

  // `scope: 'local'` cierra ESTA sesion y solo esta. Por defecto, Supabase cierra
  // TODAS las del usuario en todos sus dispositivos, y eso no es lo que espera
  // quien pulsa "cerrar sesion" en el ordenador del mostrador: le cerraria
  // tambien la del movil, sin avisar y sin forma de deshacerlo.
  //
  // Cerrar en todas partes es una funcion legitima —cuando se pierde un
  // dispositivo— pero es OTRO boton, con su propia advertencia.
  //
  // Se descubrio porque rompia la suite E2E: varios navegadores entraban con la
  // misma cuenta y el primero que salia dejaba a los demas con un token que
  // apuntaba a una sesion borrada. GoTrue respondia "session_not_found" y la
  // aplicacion concluia, razonablemente, que no habia nadie dentro.
  await supabase.auth.signOut({ scope: 'local' });

  const store = await cookies();
  store.delete(ACTIVE_TENANT_COOKIE);

  redirect('/login');
}

/** Cambia la empresa activa de quien pertenece a mas de una. */
export async function switchTenantAction(formData: FormData): Promise<void> {
  const tenantId = formData.get('tenantId');
  if (typeof tenantId !== 'string') redirect('/');

  // No se comprueba aqui que la empresa sea suya, y es intencionado: lo comprueba
  // `forRequest()` contra la pertenencia real de la base de datos en cada
  // request. Validarlo en dos sitios invita a que uno de los dos se relaje.
  (await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  redirect('/');
}
