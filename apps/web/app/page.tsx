import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  FileText,
  Package,
  Receipt,
  TrendingUp,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { can } from '@corebiz/domain';
import { activeDriver, apiForRequest } from '@/api/session';
import { currentUser, supabaseIsConfigured } from '@/auth/supabase';
import { signupConfig } from '@/demo/sandbox';
import { Shell, TableFrame, Empty } from '@/ui/shell';
import { Card, Stat, SectionTitle } from '@/ui/primitives';
import { ButtonLink } from '@/ui/button';
import { Badge } from '@/ui/feedback';
import { DesktopOnly, MobileList, MobileListItem } from '@/ui/list';
import { Logo } from '@/ui/logo';

/**
 * La raiz hace dos trabajos, y son dos pantallas distintas.
 *
 * CON sesion es el panel de inicio: lo primero que se ve al abrir el sistema, y por eso
 * tiene que decir algo. Antes era una lista de enlaces a los modulos —los mismos que ya
 * estan en el menu—, es decir, una pantalla entera que no aportaba un solo dato.
 *
 * SIN sesion es la presentacion del producto. Ese caso solo ocurre desplegado: en
 * desarrollo se entra solo con la cuenta sembrada, asi que la portada publica
 * practicamente no se ve. Sigue existiendo porque en produccion es la puerta.
 *
 * No llama a `apiForRequest()` hasta saber que hay sesion, y eso es deliberado: montar
 * el contenedor de datos sin sesion redirige a la pantalla de acceso, y la portada
 * publica tiene que poder verse siempre.
 */
export default async function HomePage() {
  // The memory driver has no Supabase and no sign-in: the API resolves a fixed demo
  // identity, and every other screen already works with it. Treating the root as signed
  // out there showed the public landing page instead of the dashboard, which is what the
  // smoke test caught.
  if (activeDriver() === 'memory') return <Panel />;

  const user = supabaseIsConfigured() ? await currentUser() : null;
  return user === null ? <Presentacion /> : <Panel />;
}

async function Panel() {
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx, session, queries } = await apiForRequest();

  /*
   * El resumen de ventas exige `report:read`, y almacen no lo tiene.
   *
   * Sin esta comprobacion, quien entrara con ese rol recibiria un 403 del API y la
   * pantalla de inicio —la primera que se ve— seria un error. Se degrada: se le enseñan
   * las secciones que si le corresponden, que ademas son las suyas.
   */
  const puedeVerCifras = can(ctx.actor, 'report:read');

  const [resumen, notas, productos] = await Promise.all([
    puedeVerCifras ? queries.reports.salesSummary() : Promise.resolve(null),
    queries.deliveryNotes.list({ limit: 5 }),
    queries.products.list({ limit: 100 }),
  ]);

  const bajoMinimo = productos.items.filter((p) => p.belowMinimum);

  return (
    <Shell ctx={ctx} session={session} title={t('home.title')} subtitle={t('home.subtitle')}>
      {resumen !== null && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:mb-10 lg:grid-cols-4">
          <Stat label={t('reports.salesTotal')} value={`$ ${resumen.salesTotal}`} icon={Wallet} />
          <Stat
            label={t('reports.documentsIssued')}
            value={String(resumen.documentCount)}
            icon={FileText}
          />
          <Stat
            label={t('reports.averageTicket')}
            value={`$ ${resumen.averageTicket}`}
            icon={TrendingUp}
          />
          <Stat
            label={t('reports.stockValue')}
            value={`$ ${resumen.inventoryValue}`}
            icon={Boxes}
          />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="ultimas-notas">
          <SectionTitle action={<SeeAll href="/delivery-notes" label={t('home.seeAll')} />}>
            <span id="ultimas-notas">{t('home.recentNotes')}</span>
          </SectionTitle>

          {notas.items.length === 0 ? (
            <Empty icon={Receipt}>{t('deliveryNotes.empty')}</Empty>
          ) : (
            <>
              <MobileList>
                {notas.items.map((nota) => (
                  <MobileListItem
                    key={nota.id}
                    href={`/delivery-notes/${nota.id}`}
                    title={nota.customerName}
                    subtitle={
                      nota.issuedAt !== null
                        ? `${nota.number} · ${format.dateTime(nota.issuedAt, { dateStyle: 'medium' })}`
                        : nota.number
                    }
                    trailing={`$ ${nota.total}`}
                  />
                ))}
              </MobileList>
              <DesktopOnly>
                <TableFrame>
                  <tbody>
                    {notas.items.map((nota) => (
                      <tr key={nota.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <Link
                            href={`/delivery-notes/${nota.id}`}
                            className="font-mono text-xs font-medium text-brand underline-offset-2 hover:underline"
                          >
                            {nota.number}
                          </Link>
                          {nota.issuedAt !== null && (
                            <span className="mt-0.5 block text-xs text-muted">
                              {format.dateTime(nota.issuedAt, { dateStyle: 'medium' })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ink-soft">{nota.customerName}</td>
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                          $ {nota.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableFrame>
              </DesktopOnly>
            </>
          )}
        </section>

        <section aria-labelledby="bajo-minimo">
          <SectionTitle action={<SeeAll href="/products" label={t('home.seeAll')} />}>
            <span id="bajo-minimo">{t('home.lowStock')}</span>
          </SectionTitle>

          {bajoMinimo.length === 0 ? (
            <Empty icon={Package}>{t('home.lowStockEmpty')}</Empty>
          ) : (
            <>
              <MobileList>
                {bajoMinimo.map((producto) => (
                  <MobileListItem
                    key={producto.id}
                    href={`/products/${producto.id}`}
                    title={producto.name}
                    subtitle={producto.sku}
                    trailing={`${producto.onHand} ${producto.unit}`}
                    trailingHint={<Badge tone="warn">{t('products.lowStock')}</Badge>}
                  />
                ))}
              </MobileList>
              <DesktopOnly>
                <TableFrame>
                  <tbody>
                    {bajoMinimo.map((producto) => (
                      <tr key={producto.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <Link
                            href={`/products/${producto.id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {producto.name}
                          </Link>
                          <span className="mt-0.5 block font-mono text-xs text-muted">
                            {producto.sku}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-warn-ink tabular-nums">
                          <AlertTriangle
                            aria-label={t('products.lowStock')}
                            className="mr-1.5 inline size-3.5 align-[-2px]"
                            strokeWidth={2}
                          />
                          {producto.onHand} {producto.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableFrame>
              </DesktopOnly>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-brand underline-offset-4 transition hover:underline"
    >
      {label}
    </Link>
  );
}

/**
 * La puerta publica. Solo se ve desplegado, donde no hay inicio de sesion automatico.
 *
 * A product page, not a paragraph: what it is, the one action that matters (open the demo)
 * and a glimpse of the product itself, drawn in HTML because the CSP serves no remote image.
 */
async function Presentacion() {
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
