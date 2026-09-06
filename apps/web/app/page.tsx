import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { activeDriver } from '@/composition/container';

export default async function HomePage() {
  const t = await getTranslations();
  const driver = activeDriver();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">{t('app.name')}</h1>
        <p className="mt-2 text-lg text-[var(--color-muted)]">{t('app.tagline')}</p>
      </header>

      {driver === 'memory' && (
        <div className="mb-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-medium">{t('demo.banner')}</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{t('demo.memoryDriver')}</p>
        </div>
      )}

      <nav aria-label={t('nav.customers')}>
        <ul className="space-y-3">
          <li>
            <Link
              href="/customers"
              className="flex items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4 transition hover:border-[var(--color-brand)]"
            >
              <span className="font-medium">{t('nav.customers')}</span>
              <span aria-hidden="true" className="text-[var(--color-muted)]">
                →
              </span>
            </Link>
          </li>
        </ul>
      </nav>

      <footer className="mt-16 border-t border-[var(--color-line)] pt-6">
        <p className="text-sm text-[var(--color-muted)]">{t('legal.notice')}</p>
      </footer>
    </main>
  );
}
