import { ok, err, type Result } from '../result.js';
import type { ExchangeRateError, MoneyError } from '../errors.js';
import { Money, parseDecimalToMinor, pow10, type Currency, type Rounding } from './money.js';

/**
 * Decimales con los que se guarda la tasa. Ocho es holgado: cubre tanto tasas de
 * 36,50 Bs/USD como escenarios de hiperinflacion con muchos decimales significativos.
 */
export const RATE_SCALE = 8;
const RATE_DIVISOR = pow10(RATE_SCALE);

/**
 * Tasa de cambio con marca temporal, inmutable.
 *
 * La invariante central del negocio venezolano: cuando se emite un documento, la tasa
 * vigente en ese instante queda CONGELADA dentro del documento. Reimprimir una nota de
 * entrega de hace seis meses debe mostrar la tasa de entonces, no la de hoy. Convertir
 * a posteriori con la tasa actual no es un detalle cosmetico: reescribe el historico
 * contable del negocio.
 *
 * Por eso `capturedAt` es obligatorio y no hay ningun metodo que mute la tasa.
 */
export class ExchangeRate {
  private constructor(
    readonly from: Currency,
    readonly to: Currency,
    /** Tasa escalada por 10^RATE_SCALE. 36,50 Bs/USD se guarda como 3_650_000_000n. */
    readonly scaledRate: bigint,
    readonly capturedAt: Date,
  ) {
    Object.freeze(this);
  }

  static of(
    rate: string | number,
    from: Currency,
    to: Currency,
    capturedAt: Date,
  ): Result<ExchangeRate, ExchangeRateError> {
    const raw = typeof rate === 'number' ? rate.toString() : rate;
    if (typeof rate === 'number' && !Number.isFinite(rate)) {
      return err({ kind: 'NonPositiveRate', raw });
    }

    const parsed = parseDecimalToMinor(raw, RATE_SCALE);
    if (!parsed.ok || parsed.value <= 0n) {
      return err({ kind: 'NonPositiveRate', raw });
    }
    if (from === to) {
      return err({ kind: 'UnconvertiblePair', from, to });
    }
    return ok(new ExchangeRate(from, to, parsed.value, new Date(capturedAt.getTime())));
  }

  /** Reconstruye desde la base de datos, donde la tasa vive ya escalada. */
  static fromScaled(
    scaledRate: bigint,
    from: Currency,
    to: Currency,
    capturedAt: Date,
  ): ExchangeRate {
    return new ExchangeRate(from, to, scaledRate, new Date(capturedAt.getTime()));
  }

  /**
   * Convierte un importe aplicando esta tasa.
   *
   * Acepta tambien la direccion inversa (dividiendo en vez de multiplicar), porque en la
   * practica se necesitan las dos: precios en USD que se muestran en Bs, y cobros
   * recibidos en Bs que hay que normalizar a USD para los reportes.
   */
  convert(
    amount: Money,
    mode: Rounding = 'HALF_UP',
  ): Result<Money, MoneyError | ExchangeRateError> {
    if (amount.currency === this.from) {
      return ok(
        Money.fromMinor(
          this.applyRounding(amount.minorUnits * this.scaledRate, RATE_DIVISOR, mode),
          this.to,
        ),
      );
    }
    if (amount.currency === this.to) {
      return ok(
        Money.fromMinor(
          this.applyRounding(amount.minorUnits * RATE_DIVISOR, this.scaledRate, mode),
          this.from,
        ),
      );
    }
    return err({ kind: 'UnconvertiblePair', from: amount.currency, to: this.to });
  }

  private applyRounding(numerator: bigint, denominator: bigint, mode: Rounding): bigint {
    const negative = numerator < 0n;
    const n = negative ? -numerator : numerator;
    const quotient = n / denominator;
    const remainder = n % denominator;
    if (remainder === 0n) return negative ? -quotient : quotient;

    let rounded: bigint;
    switch (mode) {
      case 'DOWN':
        rounded = quotient;
        break;
      case 'HALF_UP':
        rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
        break;
      case 'HALF_EVEN': {
        const twice = remainder * 2n;
        if (twice > denominator) rounded = quotient + 1n;
        else if (twice < denominator) rounded = quotient;
        else rounded = quotient % 2n === 0n ? quotient : quotient + 1n;
        break;
      }
    }
    return negative ? -rounded : rounded;
  }

  /** Representacion legible de la tasa ("36.50000000"). */
  toString(): string {
    const whole = this.scaledRate / RATE_DIVISOR;
    const fraction = (this.scaledRate % RATE_DIVISOR).toString().padStart(RATE_SCALE, '0');
    return `${whole}.${fraction}`;
  }

  /** La misma tasa sin los ceros decimales sobrantes ("36.5"). Para mostrar en pantalla. */
  toCompactString(): string {
    const full = this.toString();
    return full.includes('.') ? full.replace(/0+$/, '').replace(/\.$/, '') : full;
  }

  equals(other: ExchangeRate): boolean {
    return (
      this.from === other.from &&
      this.to === other.to &&
      this.scaledRate === other.scaledRate &&
      this.capturedAt.getTime() === other.capturedAt.getTime()
    );
  }

  toJSON(): { scaledRate: string; from: Currency; to: Currency; capturedAt: string } {
    return {
      scaledRate: this.scaledRate.toString(),
      from: this.from,
      to: this.to,
      capturedAt: this.capturedAt.toISOString(),
    };
  }
}
