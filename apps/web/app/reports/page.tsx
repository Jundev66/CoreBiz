import { getTranslations } from 'next-intl/server';
import { BarChart3, Boxes, FileText, TrendingUp, Wallet } from 'lucide-react';
import { apiForRequest } from '@/api/session';
import { Shell, TableFrame, Empty } from '@/ui/shell';
import { Stat } from '@/ui/primitives';
import { DesktopOnly, MobileList } from '@/ui/list';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

/**
 * Reportes.
 *
 * Estuvo detras del plan de pago, con su pantalla de bloqueo y un boton para asomarse.
 * Ya no: el modulo esta abierto y la pantalla solo tiene que pintar las cifras.
 */
export default async function ReportsPage() {
  const t = await getTranslations();
  const { ctx, session, queries } = await apiForRequest();

  /*
   * Without `report:read` you get a notice, not a breakdown.
   *
   * The most visible case of the problem: warehouse and read-only had "Reports" in the menu
   * and clicking it gave the server error page. The entry is no longer shown to them
   * (`@/auth/module-access`) and whoever arrives through the URL gets this.
   */
  if (!can(ctx.actor, 'report:read')) {
    return (
      <Shell ctx={ctx} session={session} title={t('reports.title')}>
        <NoAccess />
      </Shell>
    );
  }

  // Una sola llamada: contra Postgres son agregados que la base de datos calcula
  // sin traer las filas. La version anterior se bajaba quinientas notas y
  // quinientos productos para sumarlos en JavaScript.
  const report = await queries.reports.salesSummary();

  const units = (value: number): string =>
    value.toLocaleString('es-VE', { maximumFractionDigits: 3 });

  return (
    <Shell ctx={ctx} session={session} title={t('reports.title')} subtitle={t('reports.subtitle')}>
      <div className="space-y-8 lg:space-y-10">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label={t('reports.salesTotal')} value={`$ ${report.salesTotal}`} icon={Wallet} />
          <Stat
            label={t('reports.documentsIssued')}
            value={String(report.documentCount)}
            icon={FileText}
          />
          <Stat
            label={t('reports.averageTicket')}
            value={`$ ${report.averageTicket}`}
            icon={TrendingUp}
          />
          <Stat label={t('reports.stockValue')} value={`$ ${report.inventoryValue}`} icon={Boxes} />
        </div>

        <section aria-labelledby="top-products">
          <h2 id="top-products" className="mb-3 text-base font-semibold text-ink">
            {t('reports.topProducts')}
          </h2>

          {report.bestSellers.length === 0 ? (
            // No sales yet means no issued notes: that is the message that applies.
            <Empty icon={BarChart3}>{t('reports.noSales')}</Empty>
          ) : (
            <>
              <DesktopOnly>
                <TableFrame>
                  <thead>
                    <tr className="border-b border-line bg-subtle/60">
                      <th scope="col" className={TH}>
                        {t('products.name')}
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        {t('reports.units')}
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        {t('deliveryNotes.total')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.bestSellers.map((row, index) => (
                      <tr
                        key={row.name}
                        className="border-b border-line transition-colors last:border-0 hover:bg-subtle/40"
                      >
                        <td className="px-4 py-3 font-medium text-ink">
                          <span
                            aria-hidden="true"
                            className="mr-3 inline-block w-5 text-right text-xs font-normal text-n-400 tabular-nums"
                          >
                            {index + 1}
                          </span>
                          {row.name}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                          {units(row.units)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                          $ {row.revenue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableFrame>
              </DesktopOnly>

              <MobileList>
                {report.bestSellers.map((row, index) => (
                  <li key={row.name} className="flex min-h-14 items-center gap-3 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className="grid size-7 shrink-0 place-items-center rounded-pill bg-subtle text-xs font-medium text-muted tabular-nums"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">{row.name}</p>
                      <p className="mt-0.5 text-[13px] text-muted tabular-nums">
                        {t('reports.units')}: {units(row.units)}
                      </p>
                    </div>
                    <p className="shrink-0 text-[15px] font-medium text-ink tabular-nums">
                      $ {row.revenue}
                    </p>
                  </li>
                ))}
              </MobileList>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';
