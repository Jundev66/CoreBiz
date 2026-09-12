import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('notFound.title'), robots: { index: false, follow: false } };
}

/**
 * An address that does not exist.
 *
 * Until now this was the framework's default 404: in English, unbranded and with no way
 * out. It is reached more often than it seems — an old link, a half-typed address, or a
 * `notFound()` from a record the role cannot see.
 *
 * The text does NOT claim the resource ever existed. Same rule as `errors.NotFound`: saying
 * "no longer here" confirms it was, and in a multi-company system that is information about
 * someone else's data. It says what is known — we could not find it — and offers the exit.
 *
 * A Server Component: no browser JavaScript is needed to render a sentence and a link.
 */
export default async function NotFound() {
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-8 block text-center text-2xl font-semibold tracking-tight">
          {t('app.name')}
        </Link>

        <div className="space-y-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
          <h1 className="text-lg font-semibold">{t('notFound.title')}</h1>
          <p className="text-sm text-[var(--color-muted)]">{t('notFound.lead')}</p>

          <div className="pt-2">
            <Link
              href="/"
              className="inline-block rounded-[var(--radius-control)] bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)]"
            >
              {t('notFound.home')}
            </Link>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md px-6 pb-8">
        <p className="text-center text-xs text-[var(--color-muted)]">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
