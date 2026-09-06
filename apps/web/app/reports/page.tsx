import { getTranslations } from 'next-intl/server';
import { Money } from '@corebiz/domain';
import { forRequest, DEMO_PLAN_COOKIE } from '@/composition/container';
import { memoryQueries } from '@/composition/memory-driver';
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
  const { ctx } = await forRequest();

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

  const queries = memoryQueries(ctx.tenantId);
  const notes = await queries.deliveryNotes.list({ limit: 500 });
  const products = await queries.products.list({ limit: 500 });

  // Las notas anuladas no cuentan como venta: incluirlas inflaria las cifras con
  // documentos que el negocio ya revirtio.
  const active = notes.items.filter((n) => !n.isVoided);

  const salesTotal = active.reduce((acc, note) => {
    const sum = acc.add(note.totals.total);
    return sum.ok ? sum.value : acc;
  }, Money.zero(ctx.settings.baseCurrency));

  const averageTicket =
    active.length > 0
      ? Money.fromMinor(salesTotal.minorUnits / BigInt(active.length), salesTotal.currency)
      : Money.zero(ctx.settings.baseCurrency);

  const stockValue = products.items.reduce((acc, product) => {
    if (!product.trackStock) return acc;
    const line = product.price.multiplyScaled(product.onHand.scaledValue, 3);
    const sum = acc.add(line);
    return sum.ok ? sum.value : acc;
  }, Money.zero(ctx.settings.baseCurrency));

  // Ranking por unidades despachadas, agregando todas las lineas de todas las notas.
  const unitsBySku = new Map<string, { name: string; units: number; revenue: Money }>();
  for (const note of active) {
    for (const line of note.lines) {
      const entry = unitsBySku.get(line.descriptionSnapshot) ?? {
        name: line.descriptionSnapshot,
        units: 0,
        revenue: Money.zero(ctx.settings.baseCurrency),
      };
      entry.units += Number(line.quantity.scaledValue) / 1000;
      const sum = entry.revenue.add(line.lineTotal);
      if (sum.ok) entry.revenue = sum.value;
      unitsBySku.set(line.descriptionSnapshot, entry);
    }
  }
  const top = [...unitsBySku.values()].sort((a, b) => b.units - a.units).slice(0, 8);

  return (
    <Shell
      ctx={ctx}
      title={t('reports.title')}
      subtitle={t('reports.subtitle')}
      action={<PlanToggle current="pro" cookieName={DEMO_PLAN_COOKIE} label={t('reports.back')} />}
    >
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('reports.salesTotal')} value={`$ ${salesTotal.toString()}`} />
        <Stat label={t('reports.documentsIssued')} value={String(active.length)} />
        <Stat label={t('reports.averageTicket')} value={`$ ${averageTicket.toString()}`} />
        <Stat label={t('reports.stockValue')} value={`$ ${stockValue.toString()}`} />
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
          {top.map((row) => (
            <tr key={row.name} className="border-b border-[var(--color-line)] last:border-0">
              <td className="px-4 py-3">{row.name}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.units.toLocaleString('es-VE', { maximumFractionDigits: 3 })}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">$ {row.revenue.toString()}</td>
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
