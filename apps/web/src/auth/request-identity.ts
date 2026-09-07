import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { inMemoryRateLimiter, type RateLimiter } from '@corebiz/application';
import { postgresRateLimiter } from '@corebiz/infrastructure';
import { activeDriver } from '@/composition/container';

/**
 * De quien viene esta peticion, sin llegar a saberlo.
 *
 * La IP se usa para limitar intentos, no para identificar a nadie, asi que nunca
 * se guarda en claro: se guarda un hash con una sal que rota cada dia. Eso
 * conserva lo unico que hace falta —dos peticiones del mismo origen dan el mismo
 * valor dentro de la misma ventana— y hace que el rastro deje de ser util pasadas
 * veinticuatro horas.
 *
 * La sal incluye un secreto de despliegue ademas de la fecha: sin el, cualquiera
 * con la tabla delante podria recorrer el espacio de IPv4 y deshacer los hashes,
 * que es corto de sobra para un ataque de diccionario.
 */
function dailySalt(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${process.env.DEMO_COOKIE_SECRET ?? 'corebiz-sal-local'}:${day}`;
}

export async function clientFingerprint(): Promise<string> {
  const store = await headers();

  // `x-forwarded-for` puede traer una cadena de proxies; el primero es el
  // cliente. En Vercel la cabecera la pone la plataforma y no es falsificable
  // desde fuera; en otro despliegue habria que confiar solo en el proxy propio.
  const forwarded = store.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded ?? store.get('x-real-ip') ?? 'desconocida';

  return createHash('sha256').update(`${dailySalt()}:${ip}`).digest('hex').slice(0, 32);
}

/**
 * Limitador activo.
 *
 * En memoria cuando no hay base de datos, para que `pnpm dev:nodb` y los tests
 * sigan funcionando. En Postgres en cuanto la hay, porque un contador por proceso
 * no limita nada en serverless: cada instancia de funcion tendria el suyo.
 */
let memoryLimiter: RateLimiter | undefined;

export function rateLimiter(): RateLimiter {
  if (activeDriver() === 'memory' || (process.env.DATABASE_URL ?? '') === '') {
    memoryLimiter ??= inMemoryRateLimiter();
    return memoryLimiter;
  }
  return postgresRateLimiter(process.env.DATABASE_URL ?? '');
}
