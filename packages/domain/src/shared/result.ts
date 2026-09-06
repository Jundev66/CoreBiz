/**
 * Result<T, E> — los fallos esperados viajan en el tipo de retorno, no por excepcion.
 *
 * Regla del proyecto:
 *   - `Result` para reglas de NEGOCIO (stock insuficiente, cuota agotada, sin permiso).
 *     Son resultados legitimos de un caso de uso y el llamante debe decidir que hacer.
 *   - `throw` para fallos de INFRAESTRUCTURA (base de datos caida, timeout).
 *     No son casos de uso, son un 500.
 *
 * Se implementa a mano en lugar de usar neverthrow/fp-ts porque el dominio no puede
 * tener dependencias (ver la regla `domain-is-pure` en .dependency-cruiser.cjs).
 */

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/** Estrecha el tipo a Ok. Util en guards y en tests. */
export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Transforma el valor si es Ok; deja pasar el error intacto. */
export function map<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Encadena operaciones que a su vez pueden fallar. Corta en el primer error. */
export function flatMap<T, U, E, F>(
  r: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return r.ok ? fn(r.value) : r;
}

/** Transforma el error, dejando el valor intacto. Util para traducir errores entre capas. */
export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

/**
 * Colapsa una lista de Results en un Result de lista.
 * Cortocircuita en el PRIMER error: si una linea de una nota de entrega es invalida,
 * no tiene sentido seguir validando las demas.
 */
export function combine<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}

/** Extrae el valor o lanza. SOLO para tests y para el borde de la app tras verificar `ok`. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) {
    throw new Error(`unwrap() sobre un Err: ${JSON.stringify(r.error)}`);
  }
  return r.value;
}

/** Extrae el valor o devuelve el sustituto indicado. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}
