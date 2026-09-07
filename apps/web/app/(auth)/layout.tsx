import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

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
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-8 block text-center text-2xl font-semibold tracking-tight">
          {t('app.name')}
        </Link>

        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
          {children}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md px-6 pb-8">
        <p className="text-center text-xs text-[var(--color-muted)]">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
