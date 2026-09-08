import { Money, type Currency } from '@corebiz/domain';

/**
 * Como se convierten los enteros de la base en las cadenas que viajan a la
 * interfaz.
 *
 * Vive aparte porque lo usan varios adaptadores de lectura, y una segunda copia
 * de `quantity()` que redondease distinto haria que el mismo saldo se leyera de
 * dos formas segun la pantalla.
 */

/** Una suma de Postgres llega como cadena; convertirla a Number perderia centimos. */
export function toMinor(value: string | null): bigint {
  return value === null || value === '' ? 0n : BigInt(value);
}

export function money(minor: bigint, currency: Currency): string {
  return Money.fromMinor(minor, currency).toString();
}

/** Las cantidades se guardan en escala 3; se muestran sin ceros sobrantes. */
export function quantity(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / 1000n;
  const fraction = (abs % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  const sign = negative ? '-' : '';
  return fraction === '' ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}
