import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { readTheme } from '@/ui/theme';
import './globals.css';

/**
 * Inter, variable y servida desde el propio origen.
 *
 * Hasta aqui la interfaz salia con la fuente por defecto del sistema operativo, que es
 * lo que hace que una aplicacion se lea como una pagina sin terminar. `next/font` la
 * descarga en tiempo de BUILD y la sirve desde el mismo dominio: ni una peticion a
 * Google en tiempo de ejecucion —lo que ademas evita tener que abrir la CSP— y ni un
 * salto de texto al cargar, porque el tamano de la fuente se conoce de antemano.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, theme] = await Promise.all([getLocale(), getMessages(), readTheme()]);

  return (
    <html lang={locale} className={inter.variable} data-theme={theme}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
