import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Compass } from 'lucide-react';
import { buttonClasses } from '@/ui/button';
import { Logo } from '@/ui/logo';

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
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-linear-to-b from-brand-soft to-transparent"
      />

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo name={t('app.name')} size="lg" />
        </Link>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-8">
          <span className="grid size-11 place-items-center rounded-pill bg-brand-soft text-brand">
            <Compass aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
            {t('notFound.title')}
          </h1>
          <p className="mt-2 text-sm text-muted">{t('notFound.lead')}</p>

          <Link href="/" className={buttonClasses({ block: true, className: 'mt-6' })}>
            {t('notFound.home')}
          </Link>
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-md px-6 pb-8">
        <p className="text-center text-xs text-muted">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
