import { redirect } from 'next/navigation';
import { supabaseServer } from '@/auth/supabase';

/**
 * El regreso desde un enlace de correo.
 *
 * Existe porque faltaba, y su ausencia rompía la recuperación de contraseña entera.
 *
 * `@supabase/ssr` usa el flujo PKCE: al pedir el enlace se guarda un verificador en una
 * cookie del navegador y el correo llega con un `?code=`. Ese código **no es una
 * sesión**: hay que canjearlo, y el canje tiene que ocurrir donde se puedan ESCRIBIR
 * cookies. Un Server Component no puede —`setAll` lanza y se traga en silencio— así que
 * tiene que ser un route handler como este.
 *
 * Sin él, quien pulsaba el enlace del correo llegaba a `/reset-password` sin sesión de
 * recuperación, `getUser()` devolvía null y la pantalla decía «el enlace caducó» sobre
 * un enlace recién emitido. Es decir: **nadie podía recuperar su contraseña**, y el
 * mensaje culpaba al enlace.
 *
 * Sirve también para la confirmación de correo del alta, que en producción está
 * activada y llega por la misma vía.
 *
 * Que el canje exija la cookie del verificador es una propiedad, no un estorbo: el
 * enlace solo funciona en el navegador que lo pidió. Reenviárselo a alguien no le sirve
 * de nada.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<never> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const destino = url.searchParams.get('next');

  // Solo rutas internas. Sin esta comprobación, `?next=https://otro.sitio` convertiría
  // el enlace de un correo nuestro en un redirector abierto, que es exactamente la
  // pieza que le falta a un phishing para parecer legítimo.
  const siguiente =
    destino !== null && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';

  if (code === null) redirect('/login');

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // Un código caducado, ya usado o de otro navegador. Se manda a pedir otro en lugar de
  // dejar a la persona en un formulario que va a rechazarla.
  if (error !== null) redirect('/forgot-password?caducado=1');

  redirect(siguiente);
}
