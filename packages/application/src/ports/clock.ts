/**
 * Puerto del reloj.
 *
 * El dominio no llama a `new Date()` — hay una regla de ESLint que lo prohibe. Un
 * agregado que lee el reloj del sistema es imposible de testear de forma determinista:
 * "la nota caduca en 30 dias" solo se puede probar si se puede adelantar el tiempo.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Reloj fijo para tests: el tiempo solo avanza si se le pide. */
export function fixedClock(start: Date): Clock & { advance(ms: number): void } {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}
