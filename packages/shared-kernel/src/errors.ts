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

export function assertNever(value: never, context = 'value'): never {
  throw new Error(`${context} no manejado (unhandled): ${JSON.stringify(value)}`);
}
