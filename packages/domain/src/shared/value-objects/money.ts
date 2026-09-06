import { ok, err, type Result } from '../result.js';
import type { MoneyError } from '../errors.js';

/**
 * Monedas soportadas. El negocio venezolano opera de facto en dolares y liquida en
 * bolivares, asi que ambas son ciudadanas de primera clase: ningun documento guarda
 * solo una de las dos.
 */
export type Currency = 'USD' | 'VES';

/** Decimales de la unidad menor de cada moneda. */
const SCALE: Readonly<Record<Currency, number>> = { USD: 2, VES: 2 };

/** Cota de seguridad. Atrapa desbordes y datos corruptos antes de que lleguen a la base. */
const MAX_MINOR_UNITS = 9_223_372_036_854_775_807n;

export type Rounding = 'HALF_UP' | 'HALF_EVEN' | 'DOWN';

/**
 * Divide dos bigint aplicando la politica de redondeo indicada.
 *
 * Se hace a mano porque `bigint / bigint` trunca hacia cero en JavaScript, y truncar
 * importes es exactamente como se pierden centimos de forma silenciosa a lo largo de
 * miles de lineas de documento.
 */
function divideRounded(numerator: bigint, denominator: bigint, mode: Rounding): bigint {
  if (denominator === 0n) throw new Error('Division por cero al redondear un importe');

  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;

  const quotient = n / d;
  const remainder = n % d;
  if (remainder === 0n) return negative ? -quotient : quotient;

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

/** 10^n como bigint, sin pasar por `Math.pow` (que devuelve un float). */
export function pow10(n: number): bigint {
  let result = 1n;
  for (let i = 0; i < n; i += 1) result *= 10n;
  return result;
}

/**
 * Convierte una cadena decimal a unidades menores SIN pasar por coma flotante.
 *
 * Acepta la coma como separador decimal ademas del punto: en Venezuela "25,50" es lo
 * que un usuario escribe de forma natural, y aceptarlo elimina una clase entera de
 * bugs de entrada. Los separadores de millares se rechazan a proposito — son ambiguos
 * entre configuraciones regionales, y un error explicito es mejor que un importe mal leido.
 */
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

  // Se conservan todos los decimales recibidos y se redondea una sola vez al final:
  // "1.005" con escala 2 debe dar 101 centimos, no 100.
  const digits = `${wholePart}${fractionPart}`;
  const asBigInt = BigInt(digits === '' ? '0' : digits);
  const scaled =
    fractionPart.length <= scale
      ? asBigInt * pow10(scale - fractionPart.length)
      : divideRounded(asBigInt, pow10(fractionPart.length - scale), mode);

  if (scaled > MAX_MINOR_UNITS) return err({ kind: 'AmountTooLarge', raw });
  return ok(negative ? -scaled : scaled);
}

/**
 * Importe monetario inmutable, representado en unidades menores (centavos) como `bigint`.
 *
 * Nunca `number`: los importes de un ERP se suman miles de veces y `0.1 + 0.2 !== 0.3`
 * en coma flotante. `bigint` da aritmetica exacta y de precision arbitraria, que es justo
 * lo que hace falta cuando los totales en bolivares alcanzan los billones.
 */
export class Money {
  private constructor(
    readonly minorUnits: bigint,
    readonly currency: Currency,
  ) {
    Object.freeze(this);
  }

  /** Construye desde una cadena decimal ("25,50") o desde un numero de unidades mayores. */
  static of(amount: string | number, currency: Currency): Result<Money, MoneyError> {
    const raw = typeof amount === 'number' ? amount.toString() : amount;
    if (typeof amount === 'number' && !Number.isFinite(amount)) {
      return err({ kind: 'InvalidAmount', raw });
    }
    const parsed = parseDecimalToMinor(raw, SCALE[currency]);
    if (!parsed.ok) return parsed;
    return ok(new Money(parsed.value, currency));
  }

  /** Construye directamente desde unidades menores. Es la via que usan los repositorios. */
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

  private sameCurrency(other: Money): Result<true, MoneyError> {
    return this.currency === other.currency
      ? ok(true)
      : err({ kind: 'CurrencyMismatch', left: this.currency, right: other.currency });
  }

  add(other: Money): Result<Money, MoneyError> {
    const check = this.sameCurrency(other);
    if (!check.ok) return check;
    return ok(new Money(this.minorUnits + other.minorUnits, this.currency));
  }

  subtract(other: Money): Result<Money, MoneyError> {
    const check = this.sameCurrency(other);
    if (!check.ok) return check;
    return ok(new Money(this.minorUnits - other.minorUnits, this.currency));
  }

  /**
   * Multiplica por una cantidad escalada (numerador / 10^scale) redondeando una sola vez.
   * Lo usan las lineas de documento: cantidad (3 decimales) por precio unitario.
   */
  multiplyScaled(numerator: bigint, scale: number, mode: Rounding = 'HALF_UP'): Money {
    return new Money(divideRounded(this.minorUnits * numerator, pow10(scale), mode), this.currency);
  }

  /** Aplica un porcentaje expresado en puntos basicos (1600 bp = 16,00 %). */
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
    if (!check.ok) return check;
    if (this.minorUnits === other.minorUnits) return ok(0);
    return ok(this.minorUnits > other.minorUnits ? 1 : -1);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minorUnits === other.minorUnits;
  }

  /**
   * Reparte el importe segun una lista de pesos SIN perder ni inventar centimos.
   *
   * El caso clasico: repartir 100 entre 3 da 33,33 + 33,33 + 33,34. Los centimos
   * sobrantes se asignan uno a uno a las primeras partes, de modo que la suma de las
   * partes es exactamente el total original. Necesario para prorratear descuentos
   * globales entre las lineas de un documento.
   */
  allocate(weights: readonly number[]): Money[] {
    if (weights.length === 0) return [];
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) throw new Error('allocate() requiere que la suma de los pesos sea positiva');

    const scaledWeights = weights.map((w) => BigInt(Math.round(w * 1_000_000)));
    const scaledTotal = scaledWeights.reduce((sum, w) => sum + w, 0n);

    const parts = scaledWeights.map((w) => divideRounded(this.minorUnits * w, scaledTotal, 'DOWN'));
    let remainder = this.minorUnits - parts.reduce((sum, p) => sum + p, 0n);

    // Los centimos sobrantes se reparten uno a uno, en orden, hasta agotarlos.
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
      if (!next.ok) return next;
      acc = next.value;
    }
    return ok(acc);
  }

  /** Representacion canonica ("1234.56"). Es la que se serializa y se muestra sin formato local. */
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
