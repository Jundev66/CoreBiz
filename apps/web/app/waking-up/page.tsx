import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Waking } from '@/ui/waking';
import { safeInternalPath } from '@/auth/safe-redirect';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('waking.title'), robots: { index: false, follow: false } };
}

/**
 * La API estaba dormida.
 *
 * El plan gratuito de Render apaga el servicio tras quince minutos sin trafico y tarda
 * cerca de un minuto en volver. Es el precio declarado de que esto se despliegue por
 * cero euros, y la decision fue ACEPTARLO y contarlo, no esconderlo.
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
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-8 block text-center text-2xl font-semibold tracking-tight">
          {t('app.name')}
        </Link>

        <div className="space-y-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
          <h1 className="text-lg font-semibold">{t('waking.title')}</h1>
          <p className="text-sm text-[var(--color-muted)]">{t('waking.lead')}</p>
          <p className="text-sm text-[var(--color-muted)]">{t('waking.explain')}</p>

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

      <footer className="mx-auto w-full max-w-md px-6 pb-8">
        <p className="text-center text-xs text-[var(--color-muted)]">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
