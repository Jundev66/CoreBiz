'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { buttonClasses } from '@/ui/button';
import { Logo } from '@/ui/logo';

/**
 * The screen shown when something genuinely breaks.
 *
 * IT DID NOT EXIST, and it showed: a role without permission clicking "Reports", a
 * mistyped date in the address bar or a sleeping database produced the framework's default
 * page — "This page couldn't load. A server error occurred" — in ENGLISH even with the app
 * in Spanish, without navigation, without a way back, and with a numeric code that appears
 * in no log. A read-only user could break the application with one click on its own menu.
 *
 * What it does and does NOT do:
 *
 *   - It does not say what happened. It does not know, and guessing would be lying:
 *     `error.message` may contain internal detail, which is why Next does not even
 *     deliver it in production.
 *   - It shows `digest`, the only value that correlates this screen with the server
 *     trace. Next generates it; it is not input, so it cannot be forged in the browser to
 *     make support believe an incident exists.
 *   - It offers TWO exits. `reset()` retries the render, which is enough after a timeout
 *     or while the API wakes up; the link home is the exit that always works, and the one
 *     that was missing.
 *
 * No inline styles: the CSP in `middleware.ts` blocks them, so the default error page also
 * rendered half-styled. Everything uses design-system classes.
 *
 * This does NOT cover a failure in the root layout or its providers — that would be
 * `global-error.tsx`, which is deliberately absent: it cannot use the translations
 * provider, so it would be a single-language screen, and the root layout does little more
 * than read the locale and render the frame.
 */
export default function Error({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const t = useTranslations();

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

        <div
          role="alert"
          className="rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-8"
        >
          <span className="grid size-11 place-items-center rounded-pill bg-danger-soft text-danger-ink">
            <AlertTriangle aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">{t('crash.title')}</h1>
          <p className="mt-2 text-sm text-muted">{t('crash.lead')}</p>

          {error.digest !== undefined && (
            <p className="mt-4 rounded-control bg-subtle px-3 py-2 text-xs text-muted">
              {t('crash.reference')}:{' '}
              <span className="font-mono break-all text-ink">{error.digest}</span>
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className={buttonClasses({ className: 'sm:flex-1' })}
            >
              {t('crash.retry')}
            </button>
            <Link
              href="/"
              className={buttonClasses({ variant: 'secondary', className: 'sm:flex-1' })}
            >
              {t('crash.home')}
            </Link>
          </div>
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-md px-6 pb-8">
        <p className="text-center text-xs text-muted">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
