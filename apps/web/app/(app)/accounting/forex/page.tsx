import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { getForexExposure } from '@/api/forex';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Calculator } from 'lucide-react';
import { runForexRevaluationAction } from '@/actions/forex';

export default async function ForexRevaluationPage({
  searchParams,
}: {
  searchParams: Promise<{
    currentRate?: string;
    closingRate?: string;
    foreignCurrency?: string;
    functionalCurrency?: string;
  }>;
}) {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Reexpresión Cambiaria (Forex)">
        <NoAccess />
      </Screen>
    );
  }

  const {
    currentRate: queryCurrentRate,
    closingRate: queryClosingRate,
    foreignCurrency: queryForeign,
    functionalCurrency: queryFunc,
  } = await searchParams;

  const currentRate = queryCurrentRate ?? '36.00';
  const closingRate = queryClosingRate ?? '38.50';
  const foreignCurrency = (queryForeign ?? 'USD') as 'USD' | 'VES';
  const functionalCurrency = (queryFunc ?? 'VES') as 'USD' | 'VES';

  const accounts = await listAccounts().catch(() => []);
  const gainAccount =
    accounts.find((a) => a.code.startsWith('4.2') || a.code.startsWith('42')) ??
    accounts.find((a) => a.category === 'REVENUE') ??
    accounts[0];
  const lossAccount =
    accounts.find((a) => a.code.startsWith('6.1.03') || a.code.startsWith('63')) ??
    accounts.find((a) => a.category === 'EXPENSE') ??
    accounts[1];

  const exposure = await getForexExposure({
    functionalCurrency,
    foreignCurrency,
    currentRate,
    closingRate,
  }).catch(() => null);

  const positionsPayload =
    exposure?.positions.map((p) => ({
      accountId: p.accountId,
      accountCode: p.accountCode,
      accountName: p.accountName,
      positionType: p.positionType,
      foreignCurrency,
      foreignAmount: p.foreignAmount,
      historicalRate: currentRate,
      closingRate,
    })) ?? [];

  return (
    <Screen
      title="Reexpresión Cambiaria (Forex)"
      subtitle="Ajuste por fluctuación cambiaria y reconocimiento de ganancias/pérdidas no realizadas (NIIF / US GAAP)"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/accounting"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <ArrowLeft className="size-3.5" />
            <span>Volver a Contabilidad</span>
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <form
          method="GET"
          className="flex flex-wrap items-end gap-4 rounded-control border border-border bg-surface p-4"
        >
          <div>
            <label className="text-xs font-medium text-text-muted">Moneda Extranjera</label>
            <select
              name="foreignCurrency"
              defaultValue={foreignCurrency}
              className="mt-1 w-32 rounded-control border border-border bg-surface px-3 py-1.5 text-xs text-text"
            >
              <option value="USD">USD ($)</option>
              <option value="VES">VES (Bs.)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Moneda Funcional</label>
            <select
              name="functionalCurrency"
              defaultValue={functionalCurrency}
              className="mt-1 w-32 rounded-control border border-border bg-surface px-3 py-1.5 text-xs text-text"
            >
              <option value="VES">VES (Bs.)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Tasa Histórica en Libros</label>
            <input
              type="text"
              name="currentRate"
              defaultValue={currentRate}
              className="mt-1 w-36 rounded-control border border-border bg-surface px-3 py-1.5 font-mono text-xs text-text"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted">Tasa Oficial de Cierre</label>
            <input
              type="text"
              name="closingRate"
              defaultValue={closingRate}
              className="mt-1 w-36 rounded-control border border-border bg-surface px-3 py-1.5 font-mono text-xs text-text"
            />
          </div>

          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-control bg-surface-raised px-4 py-1.5 text-xs font-semibold text-text hover:bg-border"
          >
            <Calculator className="size-3.5" />
            <span>Recalcular Exposición</span>
          </button>
        </form>

        {exposure && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col rounded-control border border-border bg-surface p-4">
              <span className="text-xs font-medium text-text-muted">Exposición Total Abierta</span>
              <span className="mt-1 text-xl font-bold text-text">
                {exposure.totalForeignAmount} {foreignCurrency}
              </span>
              <span className="mt-1 text-xs text-text-muted">
                {exposure.positions.length} cuentas monetarias
              </span>
            </div>

            <div className="flex flex-col rounded-control border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Ganancia por Cambio</span>
                <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="mt-1 text-xl font-bold">
                +{exposure.totalUnrealizedGain} {functionalCurrency}
              </span>
              <span className="mt-1 text-xs">Cuentas con delta favorable</span>
            </div>

            <div className="flex flex-col rounded-control border border-rose-500/20 bg-rose-500/10 p-4 text-rose-800 dark:text-rose-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Pérdida por Cambio</span>
                <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
              </div>
              <span className="mt-1 text-xl font-bold">
                -{exposure.totalUnrealizedLoss} {functionalCurrency}
              </span>
              <span className="mt-1 text-xs">Cuentas con delta desfavorable</span>
            </div>

            <div className="flex flex-col rounded-control border border-border bg-surface p-4">
              <span className="text-xs font-medium text-text-muted">
                Impacto Neto en Resultados
              </span>
              <span
                className={`mt-1 text-xl font-bold ${
                  exposure.netUnrealized.startsWith('-')
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {exposure.netUnrealized} {functionalCurrency}
              </span>
              <span className="mt-1 text-xs text-text-muted">Efecto antes de impuestos</span>
            </div>
          </div>
        )}

        {exposure && exposure.positions.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">
                Desglose de Partidas Monetarias en Moneda Extranjera
              </h3>
              {can(ctx.actor, 'accounting:write') && gainAccount && lossAccount && (
                <form
                  action={async (formData) => {
                    'use server';
                    await runForexRevaluationAction({ status: 'idle' }, formData);
                  }}
                >
                  <input type="hidden" name="functionalCurrency" value={functionalCurrency} />
                  <input
                    type="hidden"
                    name="revaluationDate"
                    value={new Date().toISOString().slice(0, 10)}
                  />
                  <input type="hidden" name="gainAccountId" value={gainAccount.id} />
                  <input type="hidden" name="lossAccountId" value={lossAccount.id} />
                  <input
                    type="hidden"
                    name="description"
                    value={`Reexpresión cambiaria al cierre (${currentRate} -> ${closingRate})`}
                  />
                  <input
                    type="hidden"
                    name="positionsJson"
                    value={JSON.stringify(positionsPayload)}
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-control bg-brand px-3 py-1.5 text-xs font-semibold text-brand-contrast hover:bg-brand-hover"
                  >
                    <DollarSign className="size-3.5" />
                    <span>Asentar Ajuste en Diario Contable</span>
                  </button>
                </form>
              )}
            </div>

            <TableFrame>
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-raised font-semibold text-text-muted">
                    <th className="px-3 py-2.5">Código</th>
                    <th className="px-3 py-2.5">Nombre de Cuenta</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5 text-right">Saldo Extranjero</th>
                    <th className="px-3 py-2.5 text-right">Valor Histórico</th>
                    <th className="px-3 py-2.5 text-right">Valor al Cierre</th>
                    <th className="px-3 py-2.5 text-right">Ajuste No Realizado</th>
                    <th className="px-3 py-2.5 text-center">Efecto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {exposure.positions.map((pos) => (
                    <tr key={pos.accountId} className="hover:bg-surface-raised/50">
                      <td className="px-3 py-2.5 font-mono font-medium text-text">
                        {pos.accountCode}
                      </td>
                      <td className="px-3 py-2.5 text-text">{pos.accountName}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={pos.positionType === 'ASSET' ? 'brand' : 'neutral'}>
                          {pos.positionType === 'ASSET' ? 'ACTIVO' : 'PASIVO'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium text-text">
                        {pos.foreignAmount} {foreignCurrency}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-muted">
                        {pos.historicalBookValue} {functionalCurrency}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-text">
                        {pos.revaluedMarketValue} {functionalCurrency}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">
                        <span
                          className={
                            pos.isGain
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {pos.isGain ? '+' : '-'}
                          {pos.unrealizedDelta} {functionalCurrency}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge tone={pos.isGain ? 'success' : 'danger'}>
                          {pos.isGain ? 'GANANCIA' : 'PÉRDIDA'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
          </div>
        ) : (
          <Empty>
            <div className="flex flex-col items-center gap-3">
              <Calculator className="size-8 text-text-muted" />
              <div className="text-center">
                <div className="font-semibold text-text">
                  No hay partidas monetarias en moneda extranjera
                </div>
                <div className="text-xs text-text-muted">
                  No se detectaron cuentas de bancos, cuentas por cobrar o cuentas por pagar
                  abiertas en la divisa seleccionada.
                </div>
              </div>
            </div>
          </Empty>
        )}
      </div>
    </Screen>
  );
}
