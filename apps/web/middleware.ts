import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { autoLoginConfig } from '@/demo/sandbox';

/**
 * Middleware: cabeceras de seguridad y refresco de la sesion.
 *
 * NO toca la base de datos. Antes era una imposicion del runtime Edge; desde Next 16
 * esto corre en Node y podria, asi que pasa a ser una regla nuestra y conviene decirlo
 * en voz alta: quien decide accesos consulta la pertenencia real, y ese sitio es el
 * composition root de la API, no un archivo que se ejecuta antes de cada peticion.
 * Aqui solo pasan tres cosas:
 *
 *   1. Se renueva el token de Supabase si toca, escribiendo las cookies en la
 *      RESPUESTA. Es el unico sitio donde se puede hacer: un Server Component no
 *      puede escribir cookies.
 *   2. Se ponen las cabeceras de seguridad, con una CSP que lleva un nonce
 *      distinto en cada request.
 *   3. En desarrollo, y solo si no hay sesion, se entra con la cuenta sembrada.
 *      Va aqui por lo mismo que el punto 1: hay que escribir cookies.
 *
 * Quien decide si alguien puede ver una pantalla NO es este archivo: es la API, que
 * consulta la pertenencia real en la base de datos. Un guardia en el middleware que se
 * apoyara en "hay cookie de sesion" seria decorativo — la cookie puede estar y no
 * valer nada.
 */

/**
 * Directivas comunes a todos los entornos.
 *
 * `frame-ancestors 'none'` es la version moderna de X-Frame-Options y la que de
 * verdad manda; la cabecera antigua se manda igual para los navegadores que no
 * la implementan. `base-uri 'none'` cierra un vector poco conocido: inyectar un
 * `<base>` reescribe el destino de TODA URL relativa de la pagina, formularios
 * incluidos.
 */
function contentSecurityPolicy(nonce: string): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const production = process.env.NODE_ENV === 'production';

  const directives = [
    `default-src 'self'`,

    // `strict-dynamic` hace que los scripts que cargue un script ya confiado
    // hereden la confianza, y de paso ANULA las listas de dominios: no hay forma
    // de colar un origen permitido por descuido.
    //
    // En desarrollo hace falta `unsafe-eval`: la recarga en caliente de Next lo
    // usa. No se manda en produccion, que es donde importa.
    production
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'unsafe-eval' 'unsafe-inline'`,

    // En produccion el CSS viaja como archivo servido por el propio origen. En
    // desarrollo Next lo inyecta en linea para poder recargarlo en caliente.
    production ? `style-src 'self' 'nonce-${nonce}'` : `style-src 'self' 'unsafe-inline'`,

    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    supabase === '' ? `connect-src 'self'` : `connect-src 'self' ${supabase}`,

    // El destino de los formularios queda fijado al propio origen: si alguien
    // logra inyectar marcado, no puede redirigir un envio con credenciales fuera.
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'none'`,
    `object-src 'none'`,
  ];

  if (production) directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

function applySecurityHeaders(headers: Headers, nonce: string): void {
  headers.set('Content-Security-Policy', contentSecurityPolicy(nonce));

  // Impide que el navegador "adivine" el tipo de un archivo servido: sin esto,
  // un contenido subido por un usuario puede acabar interpretandose como HTML.
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');

  // Al salir hacia otro sitio solo se manda el origen, nunca la ruta. La ruta de
  // un ERP lleva identificadores de documentos y de clientes.
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Se apagan explicitamente las APIs que esta aplicacion no usa. Lo importante
  // no es lo que hay en la lista, es que la lista sea corta.
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );

  // Aislamiento entre pestanas: una ventana abierta desde aqui no conserva
  // referencia a esta, y un recurso de otro origen no puede incrustarse.
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // HSTS solo en produccion: en local no hay TLS, y fijarlo en el navegador de
  // quien desarrolla deja `localhost` inaccesible por http durante dos anos.
  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
}

/**
 * Pantallas que se ven SIN sesion, y que por tanto el inicio automatico no toca.
 *
 * Las de cuenta son el motivo principal: si entrar solo alcanzara a `/login`, nadie
 * podria volver a probar el acceso real ni el alta —y `acceptance.spec.ts` las visita
 * justamente sin sesion, asi que la suite lo cazaria—. `/demo` queda fuera porque es
 * la otra puerta, la que reparte copias propias. `/api` tampoco: esas rutas traen su
 * propia autorizacion y no son pantallas.
 */
const SIN_SESION = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/demo',
  '/api',
];

function admiteInicioAutomatico(pathname: string): boolean {
  return !SIN_SESION.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);

  // Next lee el nonce de la CSP que llega en las cabeceras de PETICION para
  // ponerselo a sus propios scripts de arranque. Sin esta linea, `strict-dynamic`
  // bloquea el bootstrap del framework y la aplicacion se queda en blanco en
  // produccion — funcionando en local, donde la politica es laxa.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  /*
   * La ruta pedida, para poder volver a ella.
   *
   * Next no expone el pathname a los Server Components, y hace falta en un caso muy
   * concreto: cuando el servicio de datos esta iniciandose —el alojamiento lo duerme a
   * los quince minutos— la pantalla de espera necesita saber a donde llevar de vuelta.
   * Sin esto, quien abriera un enlace profundo acabaria en la portada.
   */
  requestHeaders.set('x-corebiz-path', `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Refresco de la sesion. Si Supabase no esta configurado se salta entero: es el
  // caso del driver en memoria, que solo usa la suite y no tiene sesiones que renovar.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  if (url !== '' && key !== '') {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            });
          }
        },
      },
    });

    // Llamarlo es el efecto: `getUser()` verifica el token contra el servidor de
    // autenticacion y, si estaba a punto de caducar, deja las cookies renovadas
    // en la respuesta. Quien decide permisos NO es esto — eso es el composition
    // root, con la pertenencia de la base de datos delante.
    const { data } = await supabase.auth.getUser();

    // Entrar solo con la cuenta sembrada. Solo cuando NO hay ya una sesion, asi que
    // ocurre una vez por visitante y no en cada peticion; a partir de ahi manda la
    // cookie de siempre. `signInWithPassword` escribe las cookies renovadas en la
    // respuesta por el mismo `setAll` de arriba.
    if (
      data.user === null &&
      autoLoginConfig.enabled() &&
      admiteInicioAutomatico(request.nextUrl.pathname)
    ) {
      await supabase.auth.signInWithPassword({
        email: autoLoginConfig.email(),
        password: autoLoginConfig.password(),
      });
    }
  }

  applySecurityHeaders(response.headers, nonce);
  return response;
}

export const config = {
  matcher: [
    /*
     * Todo menos los estaticos y el favicon.
     *
     * Se excluyen porque no llevan sesion que refrescar y porque anadirles una
     * CSP por request rompe su cacheabilidad sin proteger nada: son archivos con
     * hash en el nombre, servidos por el propio origen.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
