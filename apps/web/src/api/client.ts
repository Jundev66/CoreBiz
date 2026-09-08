import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { err, ok, type Result } from '@corebiz/domain';
import { supabaseServer, ACTIVE_TENANT_COOKIE } from '@/auth/supabase';

/**
 * El cliente HTTP contra la API.
 *
 * Sustituye al composition root: `apps/web` ya no monta casos de uso ni abre
 * transacciones. Lo que hace ahora es traducir entre el navegador y la API, y hacerlo
 * DESDE EL SERVIDOR — el token no llega al navegador en ningun momento, que es la
 * propiedad central de ADR 006 y la que hace que un XSS siga siendo molesto en lugar
 * de total.
 */

export const DEMO_ROLE_COOKIE = 'corebiz_demo_role';
export const DEMO_PLAN_COOKIE = 'corebiz_demo_plan';

/**
 * Cuanto se espera a la API antes de rendirse.
 *
 * Generoso a proposito: el plan gratuito de Render DUERME el servicio tras 15 minutos
 * sin trafico y tarda cerca de un minuto en despertar. Un timeout corto convertiria
 * ese arranque en frio en un error para el primer visitante del dia, que es
 * exactamente quien no hay que perder.
 */
const REQUEST_TIMEOUT_MS = 25_000;

export function apiBaseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (url === undefined || url === '') {
    throw new Error('Falta API_BASE_URL. Arranca la API con `pnpm dev:api` o revisa el entorno.');
  }
  return url.replace(/\/$/, '');
}

/**
 * El token de acceso, para reenviarlo a la API.
 *
 * `getSession()` y NO `getUser()`, y es correcto EXACTAMENTE aqui.
 *
 * ADR 006 prohibe `getSession()` para DECIDIR accesos, porque decodifica el token sin
 * comprobar la firma. Aqui no se decide nada: se saca el token para reenviarlo, y quien
 * verifica la firma es la API, contra el JWKS del proyecto. Ademas `getUser()` no
 * devuelve el access token, asi que no habria alternativa.
 *
 * La regla que sigue viva, y conviene no "arreglarla" en ninguna de las dos
 * direcciones: en `apps/web` NADA se decide a partir de esta llamada.
 */
export async function accessTokenOrRedirect(): Promise<string> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  // Sin sesion no se sirve nada. Quien quiera ver el sistema sin registrarse tiene
  // `/demo`, que le da una cuenta de verdad.
  if (token === undefined || token === '') redirect('/login');
  return token;
}

/**
 * La cabecera de autorizacion, o ninguna.
 *
 * En modo memoria NO hay Supabase, asi que no hay token que mandar y no hay nada que
 * aislar: la API reconoce ese modo y resuelve una identidad fija. Exigir sesion aqui
 * rompia `pnpm dev:nodb` y la suite E2E entera — todas las pantallas redirigian a
 * `/login`, que es una pantalla que en ese modo no lleva a ninguna parte.
 */
async function authorization(): Promise<Record<string, string>> {
  if (process.env.DATA_DRIVER === 'memory') return {};
  return { authorization: `Bearer ${await accessTokenOrRedirect()}` };
}

async function headers(): Promise<Record<string, string>> {
  const store = await cookies();
  const tenant = store.get(ACTIVE_TENANT_COOKIE)?.value;
  const demoRole = store.get(DEMO_ROLE_COOKIE)?.value;
  const demoPlan = store.get(DEMO_PLAN_COOKIE)?.value;

  return {
    'content-type': 'application/json',
    ...(await authorization()),
    ...(tenant !== undefined ? { 'x-corebiz-tenant': tenant } : {}),
    /*
     * Las cookies de demostracion viajan como cabeceras. La API solo las obedece
     * dentro de un tenant marcado `is_demo` Y siendo ya propietario, asi que solo
     * pueden QUITAR permisos: una cabecera es aun mas facil de escribir que una
     * cookie, y esa doble condicion es lo unico que impide que esto sea una escalada.
     */
    ...(demoRole !== undefined ? { 'x-corebiz-demo-role': demoRole } : {}),
    ...(demoPlan !== undefined ? { 'x-corebiz-demo-plan': demoPlan } : {}),
  };
}

/** El sobre con el que la API responde a cualquier error. */
export interface ApiErrorBody {
  readonly errorKind: string;
  readonly errorParams?: Readonly<Record<string, string | number>>;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

export class ApiUnavailableError extends Error {}

async function request(path: string, init?: RequestInit): Promise<Response> {
  /*
   * Las cabeceras se construyen FUERA del try, y no es una preferencia de estilo.
   *
   * `redirect()` de Next funciona LANZANDO una excepcion de control (`NEXT_REDIRECT`).
   * Con la construccion dentro, ese lanzamiento quedaba atrapado por el catch de abajo
   * y se reescribia como "la API no respondio": el usuario veia un error de servicio
   * donde tenia que ver la pantalla de acceso. Costo una suite E2E entera en rojo con
   * un mensaje que hablaba de otra cosa.
   */
  const requestHeaders = { ...(await headers()), ...init?.headers };

  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: requestHeaders,
      /*
       * Datos de una empresa concreta: nunca en cache compartida. Es la misma regla
       * que `staleTimes: { dynamic: 0 }` en next.config.ts, y aqui importa mas —
       * una respuesta cacheada de un tenant servida a otro seria una fuga.
       */
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    // Se distingue de un error de la API a proposito: "no ha contestado" y "ha dicho
    // que no" piden respuestas distintas de la interfaz.
    throw new ApiUnavailableError(`La API no respondio a ${path}`, { cause });
  }
}

/** Una lectura. Todo lo que no sea 200 es excepcional y sube. */
export async function get<T>(path: string): Promise<T> {
  const res = await request(path);

  if (res.status === 401) redirect('/login');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(`GET ${path} respondio ${res.status} (${body?.errorKind ?? 'sin clave'})`);
  }

  return (await res.json()) as T;
}

/** Una lectura que puede legitimamente no encontrar nada. */
export async function getOrNull<T>(path: string): Promise<T | null> {
  const res = await request(path);

  if (res.status === 401) redirect('/login');
  // 404 aqui NO es un fallo: es "no existe, o no es tuyo", y desde fuera no se
  // distingue a proposito. La pantalla lo trata igual que antes trataba un null.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} respondio ${res.status}`);

  return (await res.json()) as T;
}

/**
 * Una escritura.
 *
 * Devuelve un `Result` y no lanza ante un error de negocio, para que las Server
 * Actions sigan escribiendose igual que cuando llamaban al caso de uso: `if
 * (!result.ok) return { status: 'error', errorKind: result.error.kind }`.
 */
export async function send<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Result<T, { kind: string } & Record<string, string | number>>> {
  const res = await request(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) redirect('/login');

  if (!res.ok) {
    const envelope = (await res.json().catch(() => null)) as ApiErrorBody | null;
    return err({
      kind: envelope?.errorKind ?? 'Unexpected',
      ...(envelope?.errorParams ?? {}),
      // Los errores por campo se conservan aparte: la interfaz los pinta junto a su
      // input, no como aviso general.
      ...(envelope?.fieldErrors !== undefined ? { fieldErrors: '' } : {}),
    });
  }

  if (res.status === 204) return ok(undefined as T);
  return ok((await res.json()) as T);
}

/** Los errores por campo de una respuesta de validacion, para pintarlos en su input. */
export async function fieldErrorsOf(res: Response): Promise<Record<string, string>> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return { ...(body?.fieldErrors ?? {}) };
}

/**
 * Deduplica dentro de un mismo render.
 *
 * `cache()` de React y NO la deduplicacion de `fetch` de Next, que no aplica con
 * `cache: 'no-store'`. Sin esto, una pagina que llama a `apiForRequest()` en su propio
 * Server Component y otra vez dentro de `<Shell>` pediria la sesion DOS veces por
 * render: dos viajes a Render, y sobre un servicio que puede estar despertando eso se
 * nota en segundos, no en milisegundos.
 */
export const cached = cache;
