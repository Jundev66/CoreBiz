import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/ui/logo';

/**
 * Marco de las pantallas de cuenta.
 *
 * Una tarjeta centrada y nada mas: sin navegacion, sin plan, sin cuotas. Quien
 * esta intentando entrar no tiene aun un contexto de empresa que ensenarle, y
 * pintar el marco de la aplicacion alrededor de un formulario de acceso solo
 * ofrece enlaces que van a llevar de vuelta aqui.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* A soft wash of the accent behind the card: depth without an image the CSP would
          have to allow. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-linear-to-b from-brand-soft to-transparent"
      />

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo name={t('app.name')} size="lg" />
        </Link>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-8">
          {children}
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-md px-6 pb-8">
        <p className="text-center text-xs text-muted">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
