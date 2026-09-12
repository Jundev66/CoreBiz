import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AlertTriangle } from 'lucide-react';
import { can } from '@corebiz/domain';
import { activeDriver, apiForRequest } from '@/api/session';
import { currentUser, supabaseIsConfigured } from '@/auth/supabase';
import { signupConfig } from '@/demo/sandbox';
import { Shell, TableFrame, Empty } from '@/ui/shell';
import { Card, Stat, SectionTitle, SecondaryLink } from '@/ui/primitives';

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
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('reports.salesTotal')} value={`$ ${resumen.salesTotal}`} />
          <Stat label={t('reports.documentsIssued')} value={String(resumen.documentCount)} />
          <Stat label={t('reports.averageTicket')} value={`$ ${resumen.averageTicket}`} />
          <Stat label={t('reports.stockValue')} value={`$ ${resumen.inventoryValue}`} />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="ultimas-notas">
          <SectionTitle action={<SeeAll href="/delivery-notes" label={t('home.seeAll')} />}>
            <span id="ultimas-notas">{t('home.recentNotes')}</span>
          </SectionTitle>

          {notas.items.length === 0 ? (
            <Empty>{t('deliveryNotes.empty')}</Empty>
          ) : (
            <TableFrame>
              <tbody>
                {notas.items.map((nota) => (
                  <tr key={nota.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/delivery-notes/${nota.id}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        {nota.number}
                      </Link>
                      {nota.issuedAt !== null && (
                        <span className="ml-2 text-xs text-[var(--color-muted)]">
                          {format.dateTime(nota.issuedAt, { dateStyle: 'medium' })}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-soft)]">{nota.customerName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">$ {nota.total}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </section>

        <section aria-labelledby="bajo-minimo">
          <SectionTitle action={<SeeAll href="/products" label={t('home.seeAll')} />}>
            <span id="bajo-minimo">{t('home.lowStock')}</span>
          </SectionTitle>

          {bajoMinimo.length === 0 ? (
            <Card className="px-6 py-14 text-center text-sm text-[var(--color-muted)]">
              {t('home.lowStockEmpty')}
            </Card>
          ) : (
            <TableFrame>
              <tbody>
                {bajoMinimo.map((producto) => (
                  <tr
                    key={producto.id}
                    className="border-b border-[var(--color-line)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${producto.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {producto.name}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-[var(--color-muted)]">
                        {producto.sku}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-[var(--color-warn-ink)]">
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
      className="text-xs text-[var(--color-muted)] underline-offset-4 transition hover:text-[var(--color-ink)] hover:underline"
    >
      {label}
    </Link>
  );
}

/**
 * La puerta publica. Solo se ve desplegado, donde no hay inicio de sesion automatico.
 */
async function Presentacion() {
  const t = await getTranslations();

  return (
    <main className="mx-auto max-w-2xl px-5 py-20 lg:py-28">
      <h1 className="text-3xl font-semibold tracking-tight">{t('app.name')}</h1>
      <p className="mt-3 text-lg text-[var(--color-ink-soft)]">{t('app.tagline')}</p>
      <p className="mt-4 text-sm text-[var(--color-muted)]">{t('home.signedOutLead')}</p>

      <Card className="mt-10 p-6">
        <h2 className="text-base font-medium">{t('home.ownAccount')}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{t('home.ownAccountHint')}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          {/* Probar va PRIMERO y con el color de marca. Quien llega desde un enlace
              todavia no tiene motivos para rellenar un formulario de acceso. */}
          <Link
            href="/demo"
            className="inline-flex items-center rounded-[var(--radius-control)] bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)] shadow-[var(--shadow-xs)] transition hover:bg-[var(--color-brand-hover)]"
          >
            {t('demo.start')}
          </Link>
          {signupConfig.enabled() && (
            <SecondaryLink href="/signup">{t('auth.signup.submit')}</SecondaryLink>
          )}
          <SecondaryLink href="/login">{t('auth.login.submit')}</SecondaryLink>
        </div>
      </Card>

      <p className="mt-16 border-t border-[var(--color-line)] pt-5 text-xs text-[var(--color-muted)]">
        {t('legal.notice')}
      </p>
    </main>
  );
}
