import { sql } from 'drizzle-orm';
import { getDatabase, type Database } from '@corebiz/db';
import type { RateLimitDecision, RateLimiter } from '@corebiz/application';

/**
 * Limitador sobre `security.rate_limit_hit()`.
 *
 * Deliberadamente NO pasa por el Unit of Work ni establece contexto de tenant:
 * el caso mas importante que tiene que cubrir es el intento de acceso, y ahi
 * todavia no hay sesion, ni tenant, ni membresia. Exigir contexto para poder
 * contar intentos fallidos dejaria sin proteger justo la puerta de entrada.
 *
 * La funcion es SECURITY DEFINER y la tabla no esta expuesta a nadie, asi que
 * este adaptador no puede leer ni borrar contadores: solo incrementar y
 * preguntar. Es intencionado — un componente que puede reiniciar el contador que
 * le limita no esta limitado.
 */
export class DrizzleRateLimiter implements RateLimiter {
  constructor(private readonly db: Database) {}

  async hit(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    const rows = await this.db.execute(sql`
      select allowed, remaining, retry_after
        from security.rate_limit_hit(${bucket}, ${limit}, ${windowSeconds})
    `);

    const row = rows[0] as
      { allowed: boolean; remaining: number | string; retry_after: number | string } | undefined;

    if (row === undefined) {
      // No deberia ocurrir: la funcion siempre devuelve una fila. Si ocurre, la
      // base de datos no esta respondiendo como se espera, y ante la duda se
      // deniega. Un limitador que se abre cuando falla no es un limitador.
      return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
    }

    return {
      allowed: row.allowed,
      remaining: Number(row.remaining),
      retryAfterSeconds: Number(row.retry_after),
    };
  }
}

/** Monta el limitador contra la conexion compartida del proceso. */
export function postgresRateLimiter(url: string): RateLimiter {
  return new DrizzleRateLimiter(getDatabase(url));
}
