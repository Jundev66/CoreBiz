import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { listTreasurySwaps } from '@/api/treasury';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Alert, Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, ArrowRightLeft, DollarSign, Wallet, ShieldCheck } from 'lucide-react';
import { executeTreasurySwapAction } from '@/actions/treasury';
import { filterLiquidAssetAccounts } from '@/ui/account-filters';

export default async function TreasurySwapsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { ctx } = await apiForRequest();
  const { error: errorKind } = await searchParams;

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Operaciones de Tesorería & Criptoactivos">
        <NoAccess />
      </Screen>
    );
  }

  const [swaps, accounts] = await Promise.all([
    listTreasurySwaps().catch(() => []),
    listAccounts().catch(() => []),
  ]);

  const assetAccounts = filterLiquidAssetAccounts(accounts);
  const expenseAccounts = accounts.filter((a) => a.category === 'EXPENSE' || a.category === 'COGS');
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const defaultSourceAccount =
    assetAccounts.find((a) => a.code.startsWith('1.1.01') || a.code === '1010') ?? assetAccounts[0];
  const defaultTargetAccount =
    assetAccounts.find((a) => a.code.startsWith('1.1.04') || a.code === '1040') ??
    assetAccounts[1] ??
    assetAccounts[0];
  const defaultFeeAccount =
    expenseAccounts.find((a) => a.code.startsWith('6.1.02') || a.code === '6050') ??
    expenseAccounts[0];

  async function handleSwapSubmit(formData: FormData) {
    'use server';
    const res = await executeTreasurySwapAction({ status: 'idle' }, formData);
    if (res.status === 'error') {
      redirect(`/accounting/treasury?error=${encodeURIComponent(res.error ?? 'Error')}`);
    }
    redirect('/accounting/treasury');
  }

  return (
    <Screen
      title="Tesorería & Adquisición de Activos / Divisas"
      subtitle="Intercambio entre cuentas de activo (VES a USD/USDT), segregación de comisiones P2P y trazabilidad contable"
      action={
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a Contabilidad
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Total Operaciones</p>
              <p className="text-xl font-semibold text-zinc-100">{swaps.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Activos en Cartera</p>
              <p className="text-xl font-semibold text-zinc-100">{assetAccounts.length} cuentas</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Invariante Contable</p>
              <p className="text-xs font-medium text-emerald-400 mt-1">∑ Débitos ≡ ∑ Créditos</p>
            </div>
          </div>
        </div>
      </div>

      {can(ctx.actor, 'accounting:write') && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-8">
          {errorKind && (
            <Alert tone="danger" role="alert" className="mb-4">
              {errorKind === 'InsufficientFunds'
                ? 'Fondos insuficientes en la cuenta origen seleccionada para ejecutar esta operación.'
                : `No se pudo ejecutar la operación (${errorKind}).`}
            </Alert>
          )}
          <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Registrar Swap de Tesorería (Compra de USDT / Divisas)
          </h2>

          <form action={handleSwapSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Fecha</label>
                <input
                  type="date"
                  name="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Cuenta Origen (Sale Dinero)
                </label>
                <select
                  name="sourceAccountId"
                  defaultValue={defaultSourceAccount?.id}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                >
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Moneda Origen
                </label>
                <select
                  name="sourceCurrency"
                  defaultValue="VES"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                >
                  <option value="VES">VES (Bolívares)</option>
                  <option value="USD">USD (Dólares)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Monto Origen Total
                </label>
                <input
                  type="text"
                  name="sourceAmount"
                  placeholder="Ej: 100000.00"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Cuenta Destino (Ingresa Activo)
                </label>
                <select
                  name="targetAccountId"
                  defaultValue={defaultTargetAccount?.id}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                >
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Moneda Destino
                </label>
                <select
                  name="targetCurrency"
                  defaultValue="USD"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                >
                  <option value="USD">USD / USDT</option>
                  <option value="VES">VES</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Monto Destino Recibido
                </label>
                <input
                  type="text"
                  name="targetAmount"
                  placeholder="Ej: 1995.00"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Tasa Acordada (VES/USD)
                </label>
                <input
                  type="text"
                  name="exchangeRate"
                  placeholder="Ej: 50.00"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Cuenta de Comisión / Gas Fee
                </label>
                <select
                  name="feeAccountId"
                  defaultValue={defaultFeeAccount?.id}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                >
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Monto Comisión (En moneda destino)
                </label>
                <input
                  type="text"
                  name="feeAmount"
                  defaultValue="0.00"
                  placeholder="Ej: 5.00"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Referencia Externa (P2P / Hash TX)
                </label>
                <input
                  type="text"
                  name="counterpartyReference"
                  placeholder="Ej: BINANCE-P2P-12345 o 0xabc..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-md transition-colors"
              >
                Ejecutar y Asentar Swap
              </button>
            </div>
          </form>
        </div>
      )}

      {swaps.length === 0 ? (
        <Empty>No hay operaciones de tesorería registradas para esta empresa.</Empty>
      ) : (
        <TableFrame>
          <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
            <tr>
              <th className="py-2.5 px-3"># Swap</th>
              <th className="py-2.5 px-3">Fecha</th>
              <th className="py-2.5 px-3">Cuenta Origen</th>
              <th className="py-2.5 px-3">Cuenta Destino</th>
              <th className="py-2.5 px-3 text-right">Monto Origen</th>
              <th className="py-2.5 px-3 text-right">Monto Destino</th>
              <th className="py-2.5 px-3 text-right">Tasa</th>
              <th className="py-2.5 px-3 text-right">Comisión</th>
              <th className="py-2.5 px-3">Referencia / Hash</th>
              <th className="py-2.5 px-3">Asiento</th>
              <th className="py-2.5 px-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {swaps.map((s) => {
              const sourceAcc = accountById.get(s.sourceAccountId);
              const targetAcc = accountById.get(s.targetAccountId);
              return (
                <tr key={s.id} className="hover:bg-zinc-800/30">
                  <td className="py-2.5 px-3 font-mono font-medium text-zinc-200">
                    #{s.swapNumber}
                  </td>
                  <td className="py-2.5 px-3">{s.date.slice(0, 10)}</td>
                  <td className="py-2.5 px-3 text-xs text-zinc-300">
                    {sourceAcc
                      ? `${sourceAcc.code} · ${sourceAcc.name}`
                      : s.sourceAccountId.slice(0, 8)}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-zinc-300">
                    {targetAcc
                      ? `${targetAcc.code} · ${targetAcc.name}`
                      : s.targetAccountId.slice(0, 8)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                    -{s.sourceAmount} {s.sourceCurrency}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                    +{s.targetAmount} {s.targetCurrency}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">{s.exchangeRate}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-rose-400">
                    {s.feeAmount} {s.targetCurrency}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-zinc-400 truncate max-w-[150px]">
                    {s.counterpartyReference}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-zinc-400">
                    <Link
                      href="/accounting/journal-entries"
                      className="text-blue-400 hover:underline"
                    >
                      {s.journalEntryId.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge tone={s.status === 'COMPLETED' ? 'success' : 'neutral'}>
                      {s.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      )}
    </Screen>
  );
}
