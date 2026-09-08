/**
 * Conversiones para cruzar HTTP.
 *
 * Existen porque JSON no sabe de dos tipos que este dominio usa a diario:
 *
 *  - `bigint`. `JSON.stringify` LANZA sobre un bigint, no lo omite. El importe y la
 *    tasa de cambio son bigint en todo el sistema (ADR 002), asi que sin esto la
 *    primera respuesta con dinero dentro revienta.
 *  - `Date`. Sale como cadena ISO y llega al otro lado como cadena. Si nadie la
 *    revive, `getFormatter().dateTime()` de next-intl pinta "Invalid Date" y parece
 *    un fallo de formato cuando es de transporte.
 *
 * Se hace EXPLICITAMENTE y no parcheando `BigInt.prototype.toJSON`: ese parche seria
 * global y cambiaria el comportamiento dentro de `@corebiz/infrastructure` tambien,
 * donde nadie lo espera.
 */

export function bigintToString(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}

export function dateToIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
