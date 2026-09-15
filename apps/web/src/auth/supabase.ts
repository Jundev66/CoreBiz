import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sesion de Supabase sobre cookies del servidor.
 *
 * Toda la autenticacion ocurre en el servidor: los formularios son Server
 * Actions y al navegador no llega ni el SDK ni un token. Eso no es minimalismo
 * —es lo que hace que el token de sesion pueda vivir en una cookie `httpOnly`,
 * inalcanzable para cualquier script que llegue a ejecutarse en la pagina. Con el
 * cliente de navegador, el token tiene que ser legible por JavaScript por
 * definicion, y un XSS pasa de molesto a total.
 *
 * Consecuencia practica que conviene aceptar a conciencia: no hay refresco de
 * sesion en segundo plano ni eventos de `onAuthStateChange`. Para un ERP que se
 * navega por paginas completas, no hacen falta.
 */

export const AUTH_COOKIE_PREFIX = 'sb-';

/** Cookie con el tenant activo cuando alguien pertenece a mas de una empresa. */
export const ACTIVE_TENANT_COOKIE = 'corebiz_tenant';

/**
 * Atributos de toda cookie de sesion.
 *
 * `sameSite: 'lax'` y no `'strict'`: con `strict`, volver desde el enlace del
 * correo de recuperacion llegaria sin sesion y el flujo se rompe justo donde
 * menos se entiende. `lax` sigue bloqueando el envio en peticiones cruzadas de
 * escritura, que es donde esta el riesgo de CSRF.
 */
const COOKIE_DEFAULTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const satisfies CookieOptions;

export function supabaseIsConfigured(): boolean {
  return (
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') !== '' &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '') !== ''
  );
}

/**
 * Cliente para Server Components y Server Actions.
 *
 * En un Server Component las cookies son de solo lectura y `setAll` lanza. Se
 * traga a proposito: el refresco del token lo hace el proxy, que si puede
 * escribirlas. Sin este try/catch, cualquier pagina que renderice con un token a
 * punto de caducar reventaria con un error que no dice nada del problema real.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) {
              /*
               * OUR attributes go LAST, and the order is the control.
               *
               * It was the other way round — `{ ...COOKIE_DEFAULTS, ...options }` — which
               * let the library override `httpOnly`, `secure` and `sameSite` with whatever
               * its options carried. The most sensitive cookie in the system was at the
               * mercy of a future `@supabase/ssr` release, with nothing to signal it.
               * `maxAge` and `expires` do come from the library, which is what it should
               * decide: how long it lasts, not who can read it.
               *
               * The proxy already used this order. Both places that write session
               * cookies now agree.
               */
              store.set(name, value, { ...options, ...COOKIE_DEFAULTS });
            }
          } catch {
            // Server Component: las escribe el proxy en la respuesta.
          }
        },
      },
    },
  );
}

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly businessName: string | null;
}

/**
 * Usuario verificado, o null.
 *
 * Usa `getUser()` y NO `getSession()`. La diferencia importa: `getSession()` lee
 * la cookie y decodifica el token sin comprobar la firma contra el servidor de
 * autenticacion, asi que una cookie fabricada a mano pasaria por sesion valida.
 * `getUser()` la verifica. Es un viaje de red mas por request y es el precio
 * correcto: aqui se decide quien es alguien.
 */
export async function currentUser(): Promise<AuthenticatedUser | null> {
  if (!supabaseIsConfigured()) return null;

  const supabase = await supabaseServer();
  const { data, error } = await verifyUser(supabase);

  if (error !== null || data.user === null) return null;

  const metadata = data.user.user_metadata as Record<string, unknown>;
  return {
    id: data.user.id,
    email: data.user.email ?? '',
    displayName: typeof metadata.name === 'string' ? metadata.name : null,
    businessName: typeof metadata.business_name === 'string' ? metadata.business_name : null,
  };
}

/**
 * `getUser()` con reintento ante fallos que NO son de autenticacion.
 *
 * La diferencia importa mas de lo que parece. Un 401 significa "este token no
 * vale" y la respuesta correcta es mandar al acceso. Un error de red, un 500 o
 * un tiempo de espera agotado significan "no se ha podido preguntar", y tratar
 * eso como "no hay sesion" saca de la aplicacion a quien SI habia entrado — con
 * el formulario de acceso delante y sin ninguna explicacion, justo cuando el
 * servicio de autenticacion esta teniendo un mal momento.
 *
 * Salio de la suite E2E, que arranca cinco navegadores a la vez contra un
 * Supabase recien reiniciado: fallaba el primer escenario de cada fichero y
 * ninguno mas. En produccion es el mismo caso con otra escala.
 *
 * Dos reintentos cortos y se rinde. No se insiste mas porque esto corre en cada
 * peticion de cada pantalla: un bucle largo aqui convierte una indisponibilidad
 * breve en una pagina que no carga nunca.
 */
async function verifyUser(supabase: SupabaseClient) {
  let last = await supabase.auth.getUser();

  for (const wait of [150, 400]) {
    if (last.error === null) return last;

    // 401 y 403 son respuestas VALIDAS: el token no sirve. Reintentar solo
    // gastaria tiempo y llegaria a la misma conclusion.
    const status = last.error.status ?? 0;
    if (status === 401 || status === 403) return last;

    await new Promise((resolve) => setTimeout(resolve, wait));
    last = await supabase.auth.getUser();
  }

  return last;
}
