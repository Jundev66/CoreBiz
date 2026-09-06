import { ok, err, type Result } from '../result';
import type { QuantityError } from '../errors';
import { pow10 } from './money';

/**
 * Decimales de una cantidad. Tres permite vender fracciones reales (0,250 kg de queso,
 * 1,500 m de cable) sin abrir la puerta a una precision falsa.
 */
export const QUANTITY_SCALE = 3;
const QUANTITY_DIVISOR = pow10(QUANTITY_SCALE);

/**
 * Cantidad de producto, inmutable y exacta.
 *
 * Igual que `Money`, se apoya en `bigint` escalado en lugar de coma flotante: sumar
 * 0,1 + 0,2 kg trescientas veces a lo largo de un inventario tiene que dar exactamente
 * lo que debe dar, o el stock deja de cuadrar.
 */
export class Quantity {
  private constructor(readonly scaledValue: bigint) {
    Object.freeze(this);
  }

  static of(value: string | number): Result<Quantity, QuantityError> {
    const raw = typeof value === 'number' ? value.toString() : value;
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return err({ kind: 'InvalidQuantity', raw });
    }

    const trimmed = raw.trim().replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return err({ kind: 'InvalidQuantity', raw });
    }

    const negative = trimmed.startsWith('-');
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [wholePart = '0', fractionPart = ''] = unsigned.split('.');

    // Se rechaza el exceso de decimales en vez de redondearlo en silencio: si alguien
    // pide 1,2345 unidades, es mas honesto decirselo que venderle 1,235 sin avisar.
    if (fractionPart.length > QUANTITY_SCALE) {
      return err({ kind: 'TooManyDecimals', raw, max: QUANTITY_SCALE });
    }

    const digits = `${wholePart}${fractionPart.padEnd(QUANTITY_SCALE, '0')}`;
    const scaled = BigInt(digits);
    return ok(new Quantity(negative ? -scaled : scaled));
  }

  /** Como `of`, pero rechaza el cero y los negativos. Es lo que exige una linea de documento. */
  static positive(value: string | number): Result<Quantity, QuantityError> {
    const parsed = Quantity.of(value);
    if (!parsed.ok) return parsed;
    if (parsed.value.scaledValue <= 0n) {
      return err({ kind: 'NonPositiveQuantity', raw: String(value) });
    }
    return parsed;
  }

  static fromScaled(scaledValue: bigint): Quantity {
    return new Quantity(scaledValue);
  }

  static zero(): Quantity {
    return new Quantity(0n);
  }

  get isZero(): boolean {
    return this.scaledValue === 0n;
  }

  get isNegative(): boolean {
    return this.scaledValue < 0n;
  }

  get isPositive(): boolean {
    return this.scaledValue > 0n;
  }

  add(other: Quantity): Quantity {
    return new Quantity(this.scaledValue + other.scaledValue);
  }

  subtract(other: Quantity): Quantity {
    return new Quantity(this.scaledValue - other.scaledValue);
  }

  negate(): Quantity {
    return new Quantity(-this.scaledValue);
  }

  /** Devuelve -1, 0 o 1. Se usa para comprobar si hay stock suficiente. */
  compare(other: Quantity): number {
    if (this.scaledValue === other.scaledValue) return 0;
    return this.scaledValue > other.scaledValue ? 1 : -1;
  }

  isGreaterThan(other: Quantity): boolean {
    return this.scaledValue > other.scaledValue;
  }

  isLessThan(other: Quantity): boolean {
    return this.scaledValue < other.scaledValue;
  }

  equals(other: Quantity): boolean {
    return this.scaledValue === other.scaledValue;
  }

  static sum(quantities: readonly Quantity[]): Quantity {
    return quantities.reduce((acc, q) => acc.add(q), Quantity.zero());
  }

  /** Representacion canonica con los tres decimales ("2.500"). */
  toString(): string {
    const negative = this.scaledValue < 0n;
    const abs = negative ? -this.scaledValue : this.scaledValue;
    const whole = abs / QUANTITY_DIVISOR;
    const fraction = (abs % QUANTITY_DIVISOR).toString().padStart(QUANTITY_SCALE, '0');
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  /** Sin ceros decimales sobrantes ("2.5", "3"). Para mostrar en pantalla. */
  toCompactString(): string {
    return this.toString().replace(/\.?0+$/, '') || '0';
  }

  toJSON(): string {
    return this.toString();
  }
}
