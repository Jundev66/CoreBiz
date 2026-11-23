import { ok, err, type Result } from '../result';
import type { MoneyError } from '../errors';

export type Currency = 'USD' | 'VES' | 'EUR';

const SCALE: Readonly<Record<Currency, number>> = { USD: 2, VES: 2, EUR: 2 };
const MAX_MINOR_UNITS = 9_223_372_036_854_775_807n;

export type Rounding = 'HALF_UP' | 'HALF_EVEN' | 'DOWN';

function divideRounded(numerator: bigint, denominator: bigint, mode: Rounding): bigint {
  if (denominator === 0n) {
    throw new Error('Division by zero');
  }

  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;

  const quotient = n / d;
  const remainder = n % d;
  if (remainder === 0n) {
    return negative ? -quotient : quotient;
  }

  let rounded: bigint;
  switch (mode) {
    case 'DOWN':
      rounded = quotient;
      break;
    case 'HALF_UP':
      rounded = remainder * 2n >= d ? quotient + 1n : quotient;
      break;
    case 'HALF_EVEN': {
      const twice = remainder * 2n;
      if (twice > d) rounded = quotient + 1n;
      else if (twice < d) rounded = quotient;
      else rounded = quotient % 2n === 0n ? quotient : quotient + 1n;
      break;
    }
  }
  return negative ? -rounded : rounded;
}

export function pow10(n: number): bigint {
  let result = 1n;
  for (let i = 0; i < n; i += 1) {
    result *= 10n;
  }
  return result;
}

export function parseDecimalToMinor(
  raw: string,
  scale: number,
  mode: Rounding = 'HALF_UP',
): Result<bigint, MoneyError> {
  const trimmed = raw.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return err({ kind: 'InvalidAmount', raw });
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = '0', fractionPart = ''] = unsigned.split('.');

  const digits = `${wholePart}${fractionPart}`;
  const asBigInt = BigInt(digits === '' ? '0' : digits);
  const scaled =
    fractionPart.length <= scale
      ? asBigInt * pow10(scale - fractionPart.length)
      : divideRounded(asBigInt, pow10(fractionPart.length - scale), mode);

  if (scaled > MAX_MINOR_UNITS) {
    return err({ kind: 'AmountTooLarge', raw });
  }
  return ok(negative ? -scaled : scaled);
}

export class Money {
  private constructor(
    readonly minorUnits: bigint,
    readonly currency: Currency,
  ) {
    Object.freeze(this);
  }

  static of(amount: string | number, currency: Currency): Result<Money, MoneyError> {
    const raw = typeof amount === 'number' ? amount.toString() : amount;
    if (typeof amount === 'number' && !Number.isFinite(amount)) {
      return err({ kind: 'InvalidAmount', raw });
    }
    const parsed = parseDecimalToMinor(raw, SCALE[currency]);
    if (!parsed.ok) {
      return parsed;
    }
    return ok(new Money(parsed.value, currency));
  }

  static fromMinor(minorUnits: bigint, currency: Currency): Money {
    return new Money(minorUnits, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  get scale(): number {
    return SCALE[this.currency];
  }

  get isZero(): boolean {
    return this.minorUnits === 0n;
  }

  get isNegative(): boolean {
    return this.minorUnits < 0n;
  }

  get isPositive(): boolean {
    return this.minorUnits > 0n;
  }

  private sameCurrency(other: Money): Result<true, MoneyError> {
    return this.currency === other.currency
      ? ok(true)
      : err({ kind: 'CurrencyMismatch', left: this.currency, right: other.currency });
  }

  add(other: Money): Result<Money, MoneyError> {
    const check = this.sameCurrency(other);
    if (!check.ok) {
      return check;
    }
    return ok(new Money(this.minorUnits + other.minorUnits, this.currency));
  }

  subtract(other: Money): Result<Money, MoneyError> {
    const check = this.sameCurrency(other);
    if (!check.ok) {
      return check;
    }
    return ok(new Money(this.minorUnits - other.minorUnits, this.currency));
  }

  multiplyScaled(numerator: bigint, scale: number, mode: Rounding = 'HALF_UP'): Money {
    return new Money(divideRounded(this.minorUnits * numerator, pow10(scale), mode), this.currency);
  }

  percentage(basisPoints: number, mode: Rounding = 'HALF_UP'): Money {
    return new Money(
      divideRounded(this.minorUnits * BigInt(Math.round(basisPoints)), 10_000n, mode),
      this.currency,
    );
  }

  negate(): Money {
    return new Money(-this.minorUnits, this.currency);
  }

  compare(other: Money): Result<number, MoneyError> {
    const check = this.sameCurrency(other);
    if (!check.ok) {
      return check;
    }
    if (this.minorUnits === other.minorUnits) {
      return ok(0);
    }
    return ok(this.minorUnits > other.minorUnits ? 1 : -1);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minorUnits === other.minorUnits;
  }

  allocate(weights: readonly number[]): Money[] {
    if (weights.length === 0) {
      return [];
    }
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) {
      throw new Error(
        'allocate() requires weights sum to be positive / que la suma de los pesos sea positiva',
      );
    }

    const scaledWeights = weights.map((w) => BigInt(Math.round(w * 1_000_000)));
    const scaledTotal = scaledWeights.reduce((sum, w) => sum + w, 0n);

    const parts = scaledWeights.map((w) => divideRounded(this.minorUnits * w, scaledTotal, 'DOWN'));
    let remainder = this.minorUnits - parts.reduce((sum, p) => sum + p, 0n);

    const step = remainder < 0n ? -1n : 1n;
    for (let i = 0; remainder !== 0n; i = (i + 1) % parts.length) {
      parts[i] = (parts[i] ?? 0n) + step;
      remainder -= step;
    }

    return parts.map((p) => new Money(p, this.currency));
  }

  static sum(amounts: readonly Money[], currency: Currency): Result<Money, MoneyError> {
    let acc = Money.zero(currency);
    for (const amount of amounts) {
      const next = acc.add(amount);
      if (!next.ok) {
        return next;
      }
      acc = next.value;
    }
    return ok(acc);
  }

  toString(): string {
    const negative = this.minorUnits < 0n;
    const abs = negative ? -this.minorUnits : this.minorUnits;
    const divisor = pow10(this.scale);
    const whole = abs / divisor;
    const fraction = (abs % divisor).toString().padStart(this.scale, '0');
    return `${negative ? '-' : ''}${whole}${this.scale > 0 ? `.${fraction}` : ''}`;
  }

  toJSON(): { minorUnits: string; currency: Currency } {
    return { minorUnits: this.minorUnits.toString(), currency: this.currency };
  }
}
