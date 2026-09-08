import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { callInternal, InternalCallFailed } from '@/api/internal';

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
 *
 * El hash SE CALCULA AQUI y no en la API, aunque el contador viva alla. Es el unico
 * sitio donde `x-forwarded-for` es de fiar: en Vercel la pone la plataforma y no es
 * falsificable desde fuera. Calculado al otro lado del cable, la cabecera vendria de
 * nuestro propio servidor y contaria lo que le dijeramos.
 */
function dailySalt(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${process.env.REQUEST_HASH_SECRET ?? 'corebiz-sal-local'}:${day}`;
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

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number;
}

/**
 * Registra un intento y dice si se admite.
 *
 * El contador vive en la API porque necesita Postgres: una ventana por proceso no
 * limita nada cuando hay varias instancias sirviendo, y en Vercel cada invocacion
 * puede ser un proceso nuevo.
 *
 * SI LA API NO CONTESTA, se admite el intento. Es una decision incomoda y es la
 * correcta: fallar cerrado dejaria el formulario de acceso inutilizable durante el
 * arranque en frio de Render —un minuto en el que nadie podria entrar— para evitar
 * unos pocos intentos de mas en esa misma ventana. El limite protege de la fuerza
 * bruta, no de una avalancha, y una fuerza bruta que necesita que la API este caida
 * para pasar tiene un minuto al dia para intentarlo.
 */
export async function hitRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitDecision> {
  try {
    return await callInternal<RateLimitDecision>('/rate-limits', { bucket, limit, windowSeconds });
  } catch (error) {
    if (error instanceof InternalCallFailed) {
      console.warn('[rate-limit] la API no respondio; se admite el intento:', error.message);
      return { allowed: true };
    }
    throw error;
  }
}
