'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

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
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-8 block text-center text-2xl font-semibold tracking-tight">
          {t('app.name')}
        </Link>

        <div
          role="alert"
          className="space-y-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8"
        >
          <h1 className="text-lg font-semibold">{t('crash.title')}</h1>
          <p className="text-sm text-[var(--color-muted)]">{t('crash.lead')}</p>

          {error.digest !== undefined && (
            <p className="text-sm text-[var(--color-muted)]">
              {t('crash.reference')}:{' '}
              <span className="font-mono text-[var(--color-ink)]">{error.digest}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-[var(--radius-control)] bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)]"
            >
              {t('crash.retry')}
            </button>
            <Link
              href="/"
              className="rounded-[var(--radius-control)] border border-[var(--color-line-strong)] px-4 py-2 text-sm font-medium"
            >
              {t('crash.home')}
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
