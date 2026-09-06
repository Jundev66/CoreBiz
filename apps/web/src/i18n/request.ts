import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, isLocale, type Locale } from './config';

const LOCALE_COOKIE = 'corebiz_locale';

/**
 * Resuelve el idioma de cada request.
 *
 * Se usa una cookie en lugar de un prefijo en la URL (/es/clientes) a proposito: el
 * enlace del CV debe ser corto y estable, y una misma ruta compartida no deberia
 * cambiar de idioma segun quien la abrio.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieValue = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = cookieValue && isLocale(cookieValue) ? cookieValue : defaultLocale;

  return {
    locale,
    messages: ((await import(`../../messages/${locale}.json`)) as { default: AbstractIntlMessages })
      .default,
  };
});

export { LOCALE_COOKIE };
