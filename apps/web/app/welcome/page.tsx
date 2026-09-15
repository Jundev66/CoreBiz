import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, Boxes, FileText, UsersRound } from 'lucide-react';
import { signupConfig } from '@/demo/sandbox';
import { Card } from '@/ui/primitives';
import { ButtonLink } from '@/ui/button';
import { Logo } from '@/ui/logo';

/**
 * La puerta publica. Solo se ve desplegado, donde no hay inicio de sesion automatico.
 *
 * Visitors reach it at `/`: the proxy rewrites the root here when there is no valid session,
 * so the address they share and bookmark stays the root. It lives on its own route so the
 * dashboard can sit inside the application's layout.
 *
 * A product page, not a paragraph: what it is, the one action that matters (open the demo)
 * and a glimpse of the product itself, drawn in HTML because the CSP serves no remote image.
 */
export default async function WelcomePage() {
  const t = await getTranslations();

  const values = [
    { Icon: Boxes, title: t('home.valueStockTitle'), body: t('home.valueStockBody') },
    { Icon: FileText, title: t('home.valueNotesTitle'), body: t('home.valueNotesBody') },
    { Icon: UsersRound, title: t('home.valueTeamTitle'), body: t('home.valueTeamBody') },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[40rem] bg-linear-to-b from-brand-soft via-canvas to-canvas"
      />

      <header className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-control">
          <Logo name={t('app.name')} />
        </Link>
        <ButtonLink href="/login" variant="ghost" size="sm">
          {t('auth.login.submit')}
        </ButtonLink>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-center gap-12 pt-8 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-16 lg:pb-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-pill border border-brand-line bg-surface px-3 py-1 text-xs font-medium text-brand shadow-xs">
              <span aria-hidden="true" className="size-1.5 rounded-pill bg-success" />
              {t('home.heroBadge')}
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance text-ink sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
              {t('home.heroTitle')}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-pretty text-ink-soft">{t('home.heroLead')}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {/* Probar va PRIMERO y con el color de marca. Quien llega desde un enlace
                  todavia no tiene motivos para rellenar un formulario de acceso. */}
              <ButtonLink href="/demo" size="lg">
                {t('demo.start')}
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2} />
              </ButtonLink>
              {signupConfig.enabled() && (
                <ButtonLink href="/signup" variant="secondary" size="lg">
                  {t('auth.signup.submit')}
                </ButtonLink>
              )}
            </div>
            <p className="mt-4 max-w-xl text-sm text-muted">{t('home.signedOutLead')}</p>
          </div>

          <ProductPreview />
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {values.map(({ Icon, title, body }) => (
            <Card key={title} className="p-5 sm:p-6">
              <span className="grid size-10 place-items-center rounded-control bg-brand-soft text-brand">
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </span>
              <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
              <p className="mt-1.5 text-sm text-muted">{body}</p>
            </Card>
          ))}
        </section>
      </main>

      <footer className="relative border-t border-line bg-surface">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted sm:px-6">
          {t('legal.notice')}
        </p>
      </footer>
    </div>
  );
}

/**
 * A still of the product, drawn with the design system itself.
 *
 * `role="img"` with a label: to assistive technology it is one picture, not a second set
 * of figures and headings to wade through before the real content.
 */
async function ProductPreview() {
  const t = await getTranslations();

  const rows = [
    { number: 'NE-000018', customer: 'Bodega La Esquina', total: '$ 420,00' },
    { number: 'NE-000017', customer: 'Ferretería Central', total: '$ 186,50' },
    { number: 'NE-000016', customer: 'Panadería San José', total: '$ 92,00' },
  ];

  return (
    <div
      role="img"
      aria-label={t('home.previewLabel')}
      className="relative mx-auto w-full max-w-md"
    >
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[2.5rem] bg-linear-to-tr from-brand/20 via-brand/5 to-transparent blur-2xl"
      />
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <Logo name={t('app.name')} />
          <span className="grid size-7 place-items-center rounded-pill bg-brand-soft text-xs font-semibold text-brand">
            J
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4">
          <div className="rounded-control border border-line p-3">
            <p className="text-xs text-muted">{t('reports.salesTotal')}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">$ 2.480,00</p>
          </div>
          <div className="rounded-control border border-line p-3">
            <p className="text-xs text-muted">{t('reports.documentsIssued')}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">18</p>
          </div>
        </div>

        <div className="px-4 pb-4">
          <p className="mb-2 text-xs font-medium text-muted">{t('home.recentNotes')}</p>
          <div className="divide-y divide-line rounded-control border border-line">
            {rows.map((row) => (
              <div key={row.number} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium text-brand">{row.number}</p>
                  <p className="truncate text-sm text-ink-soft">{row.customer}</p>
                </div>
                <p className="text-sm font-medium tabular-nums">{row.total}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-stretch border-t border-line text-[10px] font-medium text-muted">
          {[t('nav.home'), t('nav.customers'), t('nav.products'), t('nav.deliveryNotes')].map(
            (label, index) => (
              <span
                key={label}
                className={`flex-1 py-2.5 text-center ${index === 3 ? 'text-brand' : ''}`}
              >
                {label}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
