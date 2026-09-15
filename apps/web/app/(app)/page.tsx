import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AlertTriangle, Boxes, FileText, Package, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Stat, SectionTitle } from '@/ui/primitives';
import { Badge } from '@/ui/feedback';
import { DesktopOnly, MobileList, MobileListItem } from '@/ui/list';

/**
 * El panel de inicio: lo primero que se ve al abrir el sistema, y por eso tiene que decir
 * algo. Antes era una lista de enlaces a los modulos —los mismos que ya estan en el menu—,
 * es decir, una pantalla entera que no aportaba un solo dato.
 *
 * Only for someone signed in. Without a session `/` is the product's public landing, which
 * lives in `app/welcome`: the proxy rewrites `/` there and the address stays `/`. The root
 * used to decide between both here, which kept the dashboard outside the frame's layout —
 * and made every trip back to it re-render the whole frame.
 */
export default async function DashboardPage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx, queries } = await apiForRequest();

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
    <Screen title={t('home.title')} subtitle={t('home.subtitle')}>
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
    </Screen>
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
