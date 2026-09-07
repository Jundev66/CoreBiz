import { describe, expect, it } from 'vitest';
import { inMemoryRateLimiter, RATE_LIMITS } from './rate-limiter';

/**
 * El doble en memoria del limitador.
 *
 * Se prueba con el mismo rigor que el de Postgres porque es el que sostiene
 * `pnpm dev:nodb` y los tests de los casos de uso: un doble que se comporta
 * distinto del adaptador real convierte toda la suite que lo usa en una opinion.
 */

/** Reloj controlado: sin el, comprobar el paso de una ventana exige esperar. */
function clockAt(start: number) {
  let now = start;
  return {
    now: () => new Date(now * 1000),
    advance: (seconds: number) => {
      now += seconds;
    },
  };
}

describe('inMemoryRateLimiter', () => {
  it('deja pasar hasta el limite y bloquea despues', async () => {
    const limiter = inMemoryRateLimiter();

    expect(await limiter.hit('a', 2, 60)).toMatchObject({ allowed: true, remaining: 1 });
    expect(await limiter.hit('a', 2, 60)).toMatchObject({ allowed: true, remaining: 0 });
    expect(await limiter.hit('a', 2, 60)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('cuenta cada bucket por separado', async () => {
    const limiter = inMemoryRateLimiter();

    await limiter.hit('uno', 1, 60);
    expect((await limiter.hit('uno', 1, 60)).allowed).toBe(false);
    // Si se mezclaran, limitar por IP dejaria fuera a todo el mundo en cuanto
    // una sola direccion se pasara.
    expect((await limiter.hit('otro', 1, 60)).allowed).toBe(true);
  });

  it('reabre el paso cuando la ventana cambia', async () => {
    const clock = clockAt(1_000_000);
    const limiter = inMemoryRateLimiter(clock.now);

    await limiter.hit('a', 1, 60);
    expect((await limiter.hit('a', 1, 60)).allowed).toBe(false);

    clock.advance(60);
    expect((await limiter.hit('a', 1, 60)).allowed).toBe(true);
  });

  it('devuelve un retryAfter util, nunca cero', async () => {
    const clock = clockAt(1_000_000);
    const limiter = inMemoryRateLimiter(clock.now);

    // Justo en el ultimo segundo de la ventana. Un `Retry-After` de cero invita
    // a reintentar de inmediato, que es exactamente lo que no se quiere.
    clock.advance(59);
    const decision = await limiter.hit('a', 1, 60);

    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('sigue contando despues de bloquear', async () => {
    const limiter = inMemoryRateLimiter();

    await limiter.hit('a', 1, 60);
    await limiter.hit('a', 1, 60);
    const third = await limiter.hit('a', 1, 60);

    // Dejar de contar al bloquear haria que quien insiste sin parar renovara la
    // ventana en cuanto expirase: un bache en vez de un muro.
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });
});

describe('Politicas de limitacion', () => {
  it('ninguna deja pasar un numero de intentos util para un ataque', () => {
    for (const [name, policy] of Object.entries(RATE_LIMITS)) {
      expect(policy.limit, name).toBeGreaterThan(0);
      expect(policy.windowSeconds, name).toBeGreaterThan(0);

      // Un diccionario corto ronda el millar de contrasenas. Cualquier politica
      // que admitiese cientos de intentos por minuto seria decorativa.
      const perMinute = (policy.limit / policy.windowSeconds) * 60;
      expect(perMinute, `${name} admite ${perMinute} intentos por minuto`).toBeLessThanOrEqual(10);
    }
  });
});
