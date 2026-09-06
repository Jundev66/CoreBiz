/**
 * Idiomas de la aplicacion.
 *
 * El codigo y el dominio estan en ingles (DeliveryNote, Customer); solo la interfaz se
 * traduce. Los errores de dominio viajan como codigos (`InsufficientStock`), nunca como
 * texto: es la capa de presentacion la que decide en que idioma se leen.
 */
export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'es';

export const localeNames: Record<Locale, string> = {
  es: 'Espanol',
  en: 'English',
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
