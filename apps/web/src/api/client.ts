import 'server-only';
import { cookies, headers as requestHeadersOf } from 'next/headers';
import { redirect } from 'next/navigation';
import { err, ok, type Result } from '@corebiz/domain';
import { supabaseServer, ACTIVE_TENANT_COOKIE } from '@/auth/supabase';
import { forgetFailure, rememberFailure } from '@/api/last-error';
import { clientFingerprint } from '@/auth/fingerprint';

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

/**
 * Cuanto se espera a la API antes de rendirse.
 *
 * Generoso a proposito: el plan gratuito de Render DUERME el servicio tras 15 minutos
 * sin trafico y tarda cerca de un minuto en despertar. Un timeout corto convertiria
 * ese arranque en frio en un error para el primer visitante del dia, que es
 * exactamente quien no hay que perder.
 */
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * Falta configuracion. NO es lo mismo que una API dormida.
 *
 * Tiene tipo propio porque durante un tiempo no lo tuvo: `apiBaseUrl()` lanzaba un
 * Error corriente desde DENTRO del try de `request()`, el catch lo reescribia como
 * "la API no respondio" y la web mandaba cada pantalla a la sala de espera. El
 * resultado es el peor de los mensajes posibles: invita a esperar a que despierte algo
 * que no esta dormido, y que no va a arreglarse solo por mucho que se espere.
 */
export class ApiNotConfiguredError extends Error {}

export function apiBaseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (url === undefined || url === '') {
    throw new ApiNotConfiguredError(
      'Falta API_BASE_URL. Copia `.env.example` a `.env` en la raiz del repositorio, o revisa el entorno del despliegue.',
    );
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
 * rompia el driver en memoria y la suite E2E entera — todas las pantallas redirigian a
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

  /*
   * Who is acting, for audit rows. Both headers are ALWAYS sent, even though only writes
   * leave a trace: telling reads from writes here would spread across the client a
   * decision that belongs to the API.
   *
   * The hash is COMPUTED HERE and not there, which is why it travels as a header: this is
   * the only place where `x-forwarded-for` can be trusted, because on Vercel the platform
   * sets it. Computed on the other side of the wire, the header would come from our own
   * server and the value would be the same for everyone.
   *
   * The agent is what the browser says about itself, forwarded as is. What the API can
   * believe of each value is written down in `AuditTrace`.
   */
  const userAgent = (await requestHeadersOf()).get('user-agent');

  return {
    'content-type': 'application/json',
    'x-corebiz-fingerprint': await clientFingerprint(),
    ...(userAgent !== null ? { 'x-corebiz-agent': userAgent } : {}),
    ...(await authorization()),
    ...(tenant !== undefined ? { 'x-corebiz-tenant': tenant } : {}),
    /*
     * El rol de demostracion viaja como cabecera. La API solo la obedece dentro de un
     * tenant marcado `is_demo` Y siendo ya propietario, asi que solo puede QUITAR
     * permisos: una cabecera es aun mas facil de escribir que una cookie, y esa doble
     * condicion es lo unico que impide que esto sea una escalada.
     *
     * Habia otra para alternar el plan. Se fue con los planes.
     */
    ...(demoRole !== undefined ? { 'x-corebiz-demo-role': demoRole } : {}),
  };
}

/**
 * ¿Responde la API AHORA MISMO?
 *
 * Se pregunta con un plazo corto porque no se espera a que despierte: se comprueba si
 * ya lo esta. Lo usa la puerta de la demostracion, que es el unico sitio donde sumar
 * el arranque en frio a la operacion normal se pasaria del limite de tiempo de una
 * funcion de Vercel — aprovisionar un visitante clona la base de demostracion entera,
 * y eso ya es lento con la API caliente.
 */
export async function apiIsAwake(): Promise<boolean> {
  const res = await fetch(`${apiBaseUrl()}/health`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(4_000),
  }).catch(() => null);

  return res !== null && res.ok;
}

/** El sobre con el que la API responde a cualquier error. */
export interface ApiErrorBody {
  readonly errorKind: string;
  readonly errorParams?: Readonly<Record<string, string | number>>;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

/**
 * The header where the API puts the reference for what it could not explain.
 *
 * Declared here rather than imported from `apps/api`: the web cannot depend on server
 * code, and the contract between them is HTTP. If it changes there, it changes here —
 * like the other header names in this file.
 */
const INCIDENT_HEADER = 'x-corebiz-incident';

/**
 * The incident reference, ready to append to an `Error` message.
 *
 * Read from the header rather than the body because `get()` and `getOrNull()` DISCARD a
 * failure's body: nothing survives a broken read except this exception's text, and
 * without the reference that text leads nowhere.
 */
function incidentSuffix(res: Response): string {
  const incidentId = res.headers.get(INCIDENT_HEADER);
  return incidentId === null ? '' : ` [${incidentId}]`;
}

export class ApiUnavailableError extends Error {}

/**
 * Manda a la pantalla de espera, conservando a donde queria ir.
 *
 * El plan gratuito de Render DUERME el servicio tras quince minutos sin trafico y
 * tarda cerca de un minuto en despertar. Es un coste asumido —el proyecto se despliega
 * gratis a proposito— y lo que no se puede hacer es esconderlo: un error 500 delante
 * de quien abre el enlace de un curriculum es el peor resultado posible, y un spinner
 * mudo durante un minuto no es mucho mejor.
 *
 * Asi que se le cuenta lo que pasa y cuanto falta, y se le devuelve donde estaba.
 */
async function redirectToWakeScreen(): Promise<never> {
  const path = (await requestHeadersOf()).get('x-corebiz-path') ?? '/';
  redirect(`/waking-up?next=${encodeURIComponent(path)}`);
}

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

  // Por la misma razon, la URL se resuelve FUERA del try: si falta la variable, el
  // fallo tiene que salir como lo que es y no acabar convertido en "no respondio".
  const base = apiBaseUrl();

  try {
    return await fetch(`${base}${path}`, {
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
  const res = await request(path).catch(async (error: unknown) => {
    if (error instanceof ApiUnavailableError) await redirectToWakeScreen();
    throw error;
  });

  if (res.status === 401) redirect('/login');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(
      `GET ${path} respondio ${res.status} (${body?.errorKind ?? 'sin clave'})${incidentSuffix(res)}`,
    );
  }

  return (await res.json()) as T;
}

/** Una lectura que puede legitimamente no encontrar nada. */
export async function getOrNull<T>(path: string): Promise<T | null> {
  const res = await request(path).catch(async (error: unknown) => {
    if (error instanceof ApiUnavailableError) await redirectToWakeScreen();
    throw error;
  });

  if (res.status === 401) redirect('/login');
  // 404 aqui NO es un fallo: es "no existe, o no es tuyo", y desde fuera no se
  // distingue a proposito. La pantalla lo trata igual que antes trataba un null.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} respondio ${res.status}${incidentSuffix(res)}`);

  return (await res.json()) as T;
}

/**
 * Un fallo de la API, tal como lo consume una Server Action.
 *
 * `params` viene ENTERO de la API, que copia todas las propiedades escalares del error
 * de dominio. Antes cada accion mantenia su propia lista blanca —`'limit' in error`,
 * `'sku' in error`— y ya habian divergido entre ellas: un campo nuevo en una variante
 * de error llegaba a la traduccion como un hueco, y solo en algunas pantallas.
 *
 * `fieldErrors` viaja aparte porque se pinta aparte: junto a su input, no como aviso
 * general. Aplastarlo dentro de `params` perdia cual era el campo, que es lo unico que
 * ese error tiene que decir.
 */
export interface ApiFailure {
  readonly kind: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

/**
 * An unexpected failure that ALREADY carries a reference is told with a different key.
 *
 * The temptation is to keep `Unexpected` and add `{incidentId}` to its message. That does
 * not work: `Unexpected` is ALSO what is answered when the envelope could not be read — a
 * proxy 502, a truncated response, the API half awake — and there are no parameters then.
 * next-intl does not throw on a missing parameter: it warns and renders the key PATH. The
 * notice would look fine when the API answers, and when it does not — exactly when an
 * understandable text is needed most — the person would read
 * `errors.UnexpectedWithIncident` raw inside a red box.
 *
 * Two keys, and each always receives what it needs.
 */
function kindWithIncident(kind: string, params: Readonly<Record<string, string | number>>): string {
  return kind === 'Unexpected' && 'incidentId' in params ? 'UnexpectedWithIncident' : kind;
}

/**
 * Una escritura.
 *
 * Devuelve un `Result` y no lanza ante un error de negocio, para que las Server
 * Actions sigan escribiendose igual que cuando llamaban al caso de uso: `if
 * (!result.ok) return failure(result.error)`.
 */
export async function send<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Result<T, ApiFailure>> {
  const res = await request(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) redirect('/login');

  if (!res.ok) {
    const envelope = (await res.json().catch(() => null)) as ApiErrorBody | null;
    const params = envelope?.errorParams ?? {};
    const failure: ApiFailure = {
      kind: kindWithIncident(envelope?.errorKind ?? 'Unexpected', params),
      params,
      ...(envelope?.fieldErrors !== undefined ? { fieldErrors: envelope.fieldErrors } : {}),
    };
    await rememberFailure(failure.kind, failure.params['incidentId'] ?? null);
    return err(failure);
  }

  await forgetFailure();
  if (res.status === 204) return ok(undefined as T);
  return ok((await res.json()) as T);
}
