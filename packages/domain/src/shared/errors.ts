/**
 * Errores de dominio como uniones etiquetadas, no como clases.
 *
 * Ventajas frente a `class XError extends Error`:
 *   - `switch (e.kind)` es exhaustivo: si anades una variante y olvidas manejarla,
 *     TypeScript rompe el build.
 *   - Serializables: cruzan el limite servidor/cliente de React sin perder informacion.
 *   - `kind` es una clave de traduccion: la UI decide el idioma (ES/EN), el dominio no
 *     conoce ningun texto de usuario.
 */

/** Todo error de dominio se identifica por `kind`. */
export interface DomainErrorShape {
  readonly kind: string;
}

export type ValidationError =
  | { kind: 'Required'; field: string }
  | { kind: 'TooShort'; field: string; min: number }
  | { kind: 'TooLong'; field: string; max: number }
  | { kind: 'OutOfRange'; field: string; min?: number; max?: number }
  | { kind: 'InvalidFormat'; field: string; expected: string };

export type MoneyError =
  | { kind: 'CurrencyMismatch'; left: string; right: string }
  | { kind: 'InvalidAmount'; raw: string }
  | { kind: 'NegativeAmount'; raw: string }
  | { kind: 'AmountTooLarge'; raw: string };

export type ExchangeRateError =
  | { kind: 'NonPositiveRate'; raw: string }
  | { kind: 'UnconvertiblePair'; from: string; to: string };

export type QuantityError =
  | { kind: 'InvalidQuantity'; raw: string }
  | { kind: 'NonPositiveQuantity'; raw: string }
  | { kind: 'TooManyDecimals'; raw: string; max: number };

/** Ayuda a que los `switch` sobre `kind` sean realmente exhaustivos. */
export function assertNever(value: never, context = 'valor'): never {
  throw new Error(`${context} no manejado: ${JSON.stringify(value)}`);
}
