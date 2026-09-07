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
 * traga a proposito: el refresco del token lo hace el middleware, que si puede
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
              store.set(name, value, { ...COOKIE_DEFAULTS, ...options });
            }
          } catch {
            // Server Component: las escribe el middleware en la respuesta.
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
  const { data, error } = await supabase.auth.getUser();

  if (error !== null || data.user === null) return null;

  const metadata = data.user.user_metadata as Record<string, unknown>;
  return {
    id: data.user.id,
    email: data.user.email ?? '',
    displayName: typeof metadata.name === 'string' ? metadata.name : null,
    businessName: typeof metadata.business_name === 'string' ? metadata.business_name : null,
  };
}
