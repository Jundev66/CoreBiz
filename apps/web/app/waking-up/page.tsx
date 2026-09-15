import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Waking } from '@/ui/waking';
import { Logo } from '@/ui/logo';
import { safeInternalPath } from '@/auth/safe-redirect';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('waking.title'), robots: { index: false, follow: false } };
}

/**
 * The API did not answer in time.
 *
 * On Vercel a cold function plus a Supabase project that was idle takes seconds, not the
 * minute Render's free plan used to take (ADR 011). It is still the declared price of
 * deploying for free, and the decision is to ACCEPT it and say so, not hide it.
 *
 * Lo que esta pantalla hace bien, y por lo que existe en lugar de un spinner:
 *
 *   - Dice QUE esta pasando y POR QUE, sin culpar al usuario ni fingir un fallo.
 *   - Dice cuanto lleva esperando, que es lo que convierte una espera en algo
 *     soportable: lo insufrible no es esperar, es no saber si sigue pasando algo.
 *   - Dice que solo ocurre UNA VEZ, que es la informacion que decide si quien acaba
 *     de abrir el enlace de un curriculum se queda o cierra la pestana.
 *   - Devuelve a donde iba, no a la portada.
 */
export default async function WakingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations();
  const { next } = await searchParams;

  /*
   * Only an INTERNAL path is accepted, and looking at the string is not enough: there was a
   * `startsWith('/') && !startsWith('//')` here that `/\other-site` got past, because the
   * browser treats a backslash as a slash and resolves it to another origin. The details
   * are in `safeInternalPath`.
   */
  const target = safeInternalPath(next);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-linear-to-b from-brand-soft to-transparent"
      />

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo name={t('app.name')} size="lg" />
        </Link>

        <div className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{t('waking.title')}</h1>
          <p className="text-sm text-ink-soft">{t('waking.lead')}</p>
          <p className="text-sm text-muted">{t('waking.explain')}</p>

          <Waking
            next={target}
            labels={{
              waiting: t('waking.waiting'),
              ready: t('waking.ready'),
              stuck: t('waking.stuck'),
              retry: t('waking.retry'),
            }}
          />
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-md px-6 pb-8">
        <p className="text-center text-xs text-muted">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
