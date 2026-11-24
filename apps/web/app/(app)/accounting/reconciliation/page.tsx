import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { listBankStatements, getReconciliationStatus } from '@/api/reconciliation';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, Building2, CheckCircle2, AlertTriangle, PlusCircle } from 'lucide-react';
import { importBankStatementAction, recordBankAdjustmentAction } from '@/actions/reconciliation';

export default async function BankReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ statementId?: string }>;
}) {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Conciliación Bancaria">
        <NoAccess />
      </Screen>
    );
  }

  const { statementId: queryStatementId } = await searchParams;
  const statements = await listBankStatements().catch(() => []);
  const activeStatementId = queryStatementId ?? statements[0]?.id;

  const status = activeStatementId
    ? await getReconciliationStatus(activeStatementId).catch(() => null)
    : null;

  const accounts = await listAccounts().catch(() => []);
  const bankAccounts = accounts.filter((a) => a.category === 'ASSET' && a.isReconcilable);
  const expenseAccounts = accounts.filter((a) => a.category === 'EXPENSE');

  return (
    <Screen
      title="Conciliación Bancaria"
      subtitle="Control de saldos bancarios vs. mayor contable, conciliación de movimientos y ajustes automáticos"
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
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-control border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <Building2 className="size-5 text-text-muted" />
            <div>
              <div className="text-xs font-medium text-text-muted">Estado de Cuenta Activo</div>
              <div className="text-sm font-semibold text-text">
                {status
                  ? `${status.statement.bankAccountId} (${status.statement.currency}) — Período al ${new Date(status.statement.endDate).toLocaleDateString()}`
                  : 'Ningún extracto seleccionado'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {statements.length > 1 && (
              <div className="flex items-center gap-1">
                {statements.map((s) => (
                  <Link
                    key={s.id}
                    href={`/accounting/reconciliation?statementId=${s.id}`}
                    className={`rounded-control px-2.5 py-1 text-xs font-medium ${
                      s.id === activeStatementId
                        ? 'bg-brand text-brand-contrast'
                        : 'border border-border text-text hover:bg-surface-raised'
                    }`}
                  >
                    {new Date(s.endDate).toLocaleDateString()}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {status && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col rounded-control border border-border bg-surface p-4">
              <span className="text-xs font-medium text-text-muted">Saldo según Banco</span>
              <span className="mt-1 text-xl font-bold text-text">
                {status.bankEndingBalance} {status.statement.currency}
              </span>
              <span className="mt-1 text-xs text-text-muted">Al cierre del extracto</span>
            </div>

            <div className="flex flex-col rounded-control border border-border bg-surface p-4">
              <span className="text-xs font-medium text-text-muted">Saldo según Libros (GL)</span>
              <span className="mt-1 text-xl font-bold text-text">
                {status.bookBalance} {status.statement.currency}
              </span>
              <span className="mt-1 text-xs text-text-muted">Mayor contable acumulado</span>
            </div>

            <div className="flex flex-col rounded-control border border-border bg-surface p-4">
              <span className="text-xs font-medium text-text-muted">Saldo Conciliado</span>
              <span className="mt-1 text-xl font-bold text-text">
                {status.reconciledBalance} {status.statement.currency}
              </span>
              <span className="mt-1 text-xs text-text-muted">
                {status.matchedLinesCount} de {status.totalLinesCount} movimientos
              </span>
            </div>

            <div
              className={`flex flex-col rounded-control border p-4 ${
                status.unreconciledDifference === '0.00'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                  : 'border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Diferencia por Conciliar</span>
                {status.unreconciledDifference === '0.00' ? (
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                )}
              </div>
              <span className="mt-1 text-xl font-bold">
                {status.unreconciledDifference} {status.statement.currency}
              </span>
              <span className="mt-1 text-xs">
                {status.unreconciledDifference === '0.00'
                  ? 'Conciliación Cuadrada'
                  : 'Partidas pendientes'}
              </span>
            </div>
          </div>
        )}

        {status ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">
                Movimientos del Extracto Bancario ({status.statement.lines.length})
              </h3>
              <Badge tone={status.statement.status === 'RECONCILED' ? 'success' : 'warn'}>
                {status.statement.status === 'RECONCILED' ? 'CONCILIADO' : 'ABIERTO'}
              </Badge>
            </div>

            <TableFrame>
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-raised font-semibold text-text-muted">
                    <th className="px-3 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Referencia</th>
                    <th className="px-3 py-2.5">Descripción</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5 text-right">Monto</th>
                    <th className="px-3 py-2.5 text-center">Estado</th>
                    <th className="px-3 py-2.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {status.statement.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-surface-raised/50">
                      <td className="px-3 py-2.5 text-text-muted">
                        {new Date(line.transactionDate).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-medium text-text">
                        {line.reference}
                      </td>
                      <td className="px-3 py-2.5 text-text">{line.description}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={line.lineType === 'CREDIT' ? 'success' : 'neutral'}>
                          {line.lineType === 'CREDIT' ? 'CRÉDITO (DEPÓSITO)' : 'DÉBITO (CARGO)'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-text">
                        {line.lineType === 'DEBIT' ? '-' : '+'}
                        {line.amount} {status.statement.currency}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge
                          tone={
                            line.status === 'MATCHED'
                              ? 'success'
                              : line.status === 'ADJUSTED'
                                ? 'brand'
                                : 'warn'
                          }
                        >
                          {line.status === 'MATCHED'
                            ? 'CONCILIADO'
                            : line.status === 'ADJUSTED'
                              ? 'AJUSTADO'
                              : 'PENDIENTE'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {line.status === 'UNMATCHED' && can(ctx.actor, 'accounting:write') && (
                          <form
                            action={async (formData) => {
                              'use server';
                              await recordBankAdjustmentAction({ status: 'idle' }, formData);
                            }}
                            className="inline-flex items-center gap-1"
                          >
                            <input type="hidden" name="statementId" value={status.statement.id} />
                            <input type="hidden" name="statementLineId" value={line.id} />
                            <input
                              type="hidden"
                              name="counterpartAccountId"
                              value={
                                expenseAccounts[0]?.id ??
                                accounts.find((a) => a.category === 'EXPENSE')?.id ??
                                ''
                              }
                            />
                            <button
                              type="submit"
                              className="rounded-control bg-surface-raised px-2 py-1 text-[11px] font-medium text-text hover:bg-border"
                              title="Generar asiento de ajuste automático"
                            >
                              Ajustar Comisión
                            </button>
                          </form>
                        )}
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
              <Building2 className="size-8 text-text-muted" />
              <div className="text-center">
                <div className="font-semibold text-text">No hay extractos bancarios cargados</div>
                <div className="text-xs text-text-muted">
                  Importa el estado de cuenta de la institución financiera para comenzar la
                  conciliación.
                </div>
              </div>
            </div>
          </Empty>
        )}

        {can(ctx.actor, 'accounting:write') && (
          <div className="rounded-control border border-border bg-surface p-5">
            <div className="flex items-center gap-2 font-semibold text-text">
              <PlusCircle className="size-4 text-brand" />
              <span>Importar Nuevo Estado de Cuenta Bancario</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Carga los saldos inicial, final y transacciones del período para la cuenta bancaria.
            </p>

            <form
              action={async (formData) => {
                'use server';
                await importBankStatementAction({ status: 'idle' }, formData);
              }}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <div>
                <label className="text-xs font-medium text-text-muted">Cuenta Bancaria (GL)</label>
                <select
                  name="bankAccountId"
                  required
                  className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-1.5 text-xs text-text"
                >
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted">Moneda</label>
                <select
                  name="currency"
                  defaultValue="USD"
                  className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-1.5 text-xs text-text"
                >
                  <option value="USD">USD ($)</option>
                  <option value="VES">VES (Bs.)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted">Fecha Inicio</label>
                <input
                  type="date"
                  name="startDate"
                  defaultValue="2026-11-01"
                  required
                  className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-1.5 text-xs text-text"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted">Fecha Fin</label>
                <input
                  type="date"
                  name="endDate"
                  defaultValue="2026-11-30"
                  required
                  className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-1.5 text-xs text-text"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted">Saldo Inicial</label>
                <input
                  type="text"
                  name="startingBalance"
                  placeholder="0.00"
                  defaultValue="0.00"
                  required
                  className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-1.5 text-xs text-text"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted">Saldo Final</label>
                <input
                  type="text"
                  name="endingBalance"
                  placeholder="0.00"
                  defaultValue="0.00"
                  required
                  className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-1.5 text-xs text-text"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-xs font-medium text-text-muted">
                  Líneas de Extracto (Formato JSON)
                </label>
                <textarea
                  name="linesJson"
                  rows={3}
                  defaultValue='[{"id":"line-demo-01","lineType":"CREDIT","amount":"250.00","transactionDate":"2026-11-15T12:00:00.000Z","reference":"DEP-001","description":"Depósito Cliente Demo"}]'
                  className="mt-1 w-full rounded-control border border-border bg-surface font-mono text-xs text-text"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="rounded-control bg-brand px-4 py-2 text-xs font-semibold text-brand-contrast hover:bg-brand-hover"
                >
                  Importar Extracto Bancario
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Screen>
  );
}
