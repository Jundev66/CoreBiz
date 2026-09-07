import { timingSafeEqual } from 'node:crypto';
import { purgeExpiredDemos } from '@corebiz/infrastructure';

/**
 * Purga de sandboxes caducados — la TERCERA red, no la primera.
 *
 * La purga de verdad la hace `pg_cron` dentro de Postgres cada diez minutos. Va
 * ahi y no aqui porque el cron del plan Hobby de Vercel solo admite ejecuciones
 * diarias, y un TTL de 24 horas purgado una vez al dia significa que un sandbox
 * puede vivir hasta 48.
 *
 * Este endpoint existe como respaldo: si `pg_cron` no esta disponible en el
 * proyecto —no lo esta en el Supabase local— el espacio se seguiria liberando,
 * aunque mas tarde. Tres redes para lo mismo suena excesivo hasta que la unica
 * que habia falla un fin de semana.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET ?? '';

  // Sin secreto configurado el endpoint queda CERRADO, no abierto. Uno que borra
  // datos y se abre cuando falta configuracion es la peor de las dos opciones.
  if (expected === '') return new Response('Not found', { status: 404 });

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  // Comparacion en tiempo constante. Con `===`, el tiempo de respuesta filtra
  // cuantos caracteres iniciales acerto quien lo esta probando, y eso convierte
  // adivinar el secreto en un problema lineal en vez de exponencial.
  if (!constantTimeEquals(expected, provided)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const deleted = await purgeExpiredDemos(process.env.DATABASE_URL ?? '');

  // `console.warn` y no `console.info`: la regla de lint del proyecto solo
  // admite `warn` y `error`, y tiene razon — en serverless, un `info` por
  // invocacion es ruido que hay que pagar y filtrar. Este mensaje sale una vez
  // cada diez minutos y dice cuanto se borro, que es justo lo que se mira
  // cuando el espacio no cuadra.
  console.warn(
    JSON.stringify({
      level: 'info',
      event: 'demo.purged',
      deleted,
      at: new Date().toISOString(),
    }),
  );

  return Response.json({ deleted }, { headers: { 'Cache-Control': 'no-store' } });
}

function constantTimeEquals(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
