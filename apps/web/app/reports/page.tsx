import { getTranslations } from 'next-intl/server';
import { forRequest, DEMO_PLAN_COOKIE } from '@/composition/container';
import { Shell, TableFrame } from '@/ui/shell';
import { PlanToggle } from '@/ui/plan-toggle';

/**
 * Reportes — modulo del plan PRO.
 *
 * El gate se aplica AQUI, en el servidor, antes de calcular nada. No basta con ocultar
 * el enlace en el menu: quien escriba la URL a mano llegaria igual. Y las consultas
 * caras ni siquiera se ejecutan si el plan no da acceso.
 */
export default async function ReportsPage() {
  const t = await getTranslations();
  const { ctx, queries } = await forRequest();

  if (!ctx.plan.has('reports')) {
    return (
      <Shell ctx={ctx} title={t('reports.title')} subtitle={t('reports.subtitle')}>
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-8 py-12 text-center">
          <p className="text-lg font-medium">{t('reports.locked')}</p>
          <p className="mt-2 text-[var(--color-muted)]">{t('reports.lockedDetail')}</p>

          {/* En una demo publica, un modulo bloqueado sin forma de mirar dentro deja a
              casi todo el mundo sin ver la parte que mas trabajo costo. Este boton
              cambia el plan del tenant de demostracion para poder ver ambos lados. */}
          <div className="mt-8">
            <PlanToggle
              current="free"
              cookieName={DEMO_PLAN_COOKIE}
              label={t('reports.simulate')}
            />
          </div>
        </div>
      </Shell>
    );
  }

  // Una sola llamada: contra Postgres son agregados que la base de datos calcula
  // sin traer las filas. La version anterior se bajaba quinientas notas y
  // quinientos productos para sumarlos en JavaScript.
  const report = await queries.reports.salesSummary();

  return (
    <Shell
      ctx={ctx}
      title={t('reports.title')}
      subtitle={t('reports.subtitle')}
      action={<PlanToggle current="pro" cookieName={DEMO_PLAN_COOKIE} label={t('reports.back')} />}
    >
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
