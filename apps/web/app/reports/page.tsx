import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell, TableFrame } from '@/ui/shell';

/**
 * Reportes.
 *
 * Estuvo detras del plan de pago, con su pantalla de bloqueo y un boton para asomarse.
 * Ya no: el modulo esta abierto y la pantalla solo tiene que pintar las cifras.
 */
export default async function ReportsPage() {
  const t = await getTranslations();
  const { ctx, session, queries } = await apiForRequest();

  // Una sola llamada: contra Postgres son agregados que la base de datos calcula
  // sin traer las filas. La version anterior se bajaba quinientas notas y
  // quinientos productos para sumarlos en JavaScript.
  const report = await queries.reports.salesSummary();

  return (
    <Shell ctx={ctx} session={session} title={t('reports.title')} subtitle={t('reports.subtitle')}>
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('reports.salesTotal')} value={`$ ${report.salesTotal}`} />
        <Stat label={t('reports.documentsIssued')} value={String(report.documentCount)} />
        <Stat label={t('reports.averageTicket')} value={`$ ${report.averageTicket}`} />
        <Stat label={t('reports.stockValue')} value={`$ ${report.inventoryValue}`} />
      </div>

      <h2 className="mb-4 text-lg font-semibold">{t('reports.topProducts')}</h2>
      <TableFrame>
        <thead>
          <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
            <th scope="col" className="px-4 py-3 font-medium">
              {t('products.name')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t('reports.units')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t('deliveryNotes.total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {report.bestSellers.map((row) => (
            <tr key={row.name} className="border-b border-[var(--color-line)] last:border-0">
              <td className="px-4 py-3">{row.name}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.units.toLocaleString('es-VE', { maximumFractionDigits: 3 })}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">$ {row.revenue}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
