import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { listTreasurySwaps } from '@/api/treasury';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Alert, Badge } from '@/ui/feedback';
import { Card, SectionTitle, Stat } from '@/ui/primitives';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { buttonClasses } from '@/ui/button';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, ArrowRightLeft, DollarSign, ShieldCheck, Wallet } from 'lucide-react';
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
        <Link href="/accounting" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
          <ArrowLeft className="size-3.5" />
          <span>Volver a Contabilidad</span>
        </Link>
      }
    >
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Total Operaciones"
          value={String(swaps.length)}
          icon={ArrowRightLeft}
          tone="brand"
        />
        <Stat
          label="Activos en Cartera"
          value={`${assetAccounts.length} cuentas`}
          icon={Wallet}
          tone="emerald"
        />
        <Stat
          label="Invariante Contable"
          value="∑ Débitos ≡ ∑ Créditos"
          hint="Asiento automático cuadrado"
          icon={ShieldCheck}
          tone="violet"
        />
      </div>

      {can(ctx.actor, 'accounting:write') && (
        <Card className="mb-8 p-4 sm:p-6">
          {errorKind && (
            <Alert tone="danger" role="alert" className="mb-4">
              {errorKind === 'InsufficientFunds'
                ? 'Fondos insuficientes en la cuenta origen seleccionada para ejecutar esta operación.'
                : `No se pudo ejecutar la operación (${errorKind}).`}
            </Alert>
          )}

          <div className="mb-4 flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-control bg-brand-soft text-brand">
              <DollarSign className="size-4" strokeWidth={2} />
            </span>
            <h2 className="text-base font-semibold text-ink">
              Registrar Swap de Tesorería (Compra de USDT / Divisas)
            </h2>
          </div>

          <form action={handleSwapSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="swap-date" className={LABEL_CLASSES}>
                  Fecha
                </label>
                <input
                  id="swap-date"
                  type="date"
                  name="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                />
              </div>

              <div>
                <label htmlFor="swap-source-account" className={LABEL_CLASSES}>
                  Cuenta Origen (Sale Dinero)
                </label>
                <select
                  id="swap-source-account"
                  name="sourceAccountId"
                  defaultValue={defaultSourceAccount?.id}
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
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
                <label htmlFor="swap-source-currency" className={LABEL_CLASSES}>
                  Moneda Origen
                </label>
                <select
                  id="swap-source-currency"
                  name="sourceCurrency"
                  defaultValue="VES"
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                >
                  <option value="VES">VES (Bolívares)</option>
                  <option value="USD">USD (Dólares)</option>
                </select>
              </div>

              <div>
                <label htmlFor="swap-source-amount" className={LABEL_CLASSES}>
                  Monto Origen Total
                </label>
                <input
                  id="swap-source-amount"
                  type="text"
                  name="sourceAmount"
                  placeholder="Ej: 100000.00"
                  className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="swap-target-account" className={LABEL_CLASSES}>
                  Cuenta Destino (Ingresa Activo)
                </label>
                <select
                  id="swap-target-account"
                  name="targetAccountId"
                  defaultValue={defaultTargetAccount?.id}
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
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
                <label htmlFor="swap-target-currency" className={LABEL_CLASSES}>
                  Moneda Destino
                </label>
                <select
                  id="swap-target-currency"
                  name="targetCurrency"
                  defaultValue="USD"
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                >
                  <option value="USD">USD / USDT</option>
                  <option value="VES">VES</option>
                </select>
              </div>

              <div>
                <label htmlFor="swap-target-amount" className={LABEL_CLASSES}>
                  Monto Destino Recibido
                </label>
                <input
                  id="swap-target-amount"
                  type="text"
                  name="targetAmount"
                  placeholder="Ej: 1995.00"
                  className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
                  required
                />
              </div>

              <div>
                <label htmlFor="swap-exchange-rate" className={LABEL_CLASSES}>
                  Tasa Acordada (VES/USD)
                </label>
                <input
                  id="swap-exchange-rate"
                  type="text"
                  name="exchangeRate"
                  placeholder="Ej: 50.00"
                  className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="swap-fee-account" className={LABEL_CLASSES}>
                  Cuenta de Comisión / Gas Fee
                </label>
                <select
                  id="swap-fee-account"
                  name="feeAccountId"
                  defaultValue={defaultFeeAccount?.id}
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
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
                <label htmlFor="swap-fee-amount" className={LABEL_CLASSES}>
                  Monto Comisión (Moneda Destino)
                </label>
                <input
                  id="swap-fee-amount"
                  type="text"
                  name="feeAmount"
                  defaultValue="0.00"
                  placeholder="Ej: 5.00"
                  className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
                />
              </div>

              <div>
                <label htmlFor="swap-reference" className={LABEL_CLASSES}>
                  Referencia Externa (P2P / Hash TX)
                </label>
                <input
                  id="swap-reference"
                  type="text"
                  name="counterpartyReference"
                  placeholder="Ej: BINANCE-P2P-12345"
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="submit" className={buttonClasses({ size: 'md' })}>
                Ejecutar y Asentar Swap
              </button>
            </div>
          </form>
        </Card>
      )}

      <SectionTitle>Historial de Operaciones</SectionTitle>
      {swaps.length === 0 ? (
        <Empty>No hay operaciones de tesorería registradas para esta empresa.</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-line bg-canvas text-xs text-muted">
              <th className="px-4 py-3 font-medium"># Swap</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Cuenta Origen</th>
              <th className="px-4 py-3 font-medium">Cuenta Destino</th>
              <th className="px-4 py-3 text-right font-medium">Monto Origen</th>
              <th className="px-4 py-3 text-right font-medium">Monto Destino</th>
              <th className="px-4 py-3 text-right font-medium">Tasa</th>
              <th className="px-4 py-3 text-right font-medium">Comisión</th>
              <th className="px-4 py-3 font-medium">Referencia / Hash</th>
              <th className="px-4 py-3 font-medium">Asiento</th>
              <th className="px-4 py-3 text-center font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {swaps.map((s) => {
              const sourceAcc = accountById.get(s.sourceAccountId);
              const targetAcc = accountById.get(s.targetAccountId);
              return (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono font-medium text-ink">#{s.swapNumber}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{s.date.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-xs text-ink-soft">
                    {sourceAcc
                      ? `${sourceAcc.code} · ${sourceAcc.name}`
                      : s.sourceAccountId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">
                    {targetAcc
                      ? `${targetAcc.code} · ${targetAcc.name}`
                      : s.targetAccountId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-warn-ink">
                    -{s.sourceAmount} {s.sourceCurrency}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium tabular-nums text-ok">
                    +{s.targetAmount} {s.targetCurrency}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">
                    {s.exchangeRate}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-danger">
                    {s.feeAmount} {s.targetCurrency}
                  </td>
                  <td className="max-w-[150px] truncate px-4 py-3 font-mono text-xs text-muted">
                    {s.counterpartyReference}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href="/accounting/journal-entries" className="text-brand hover:underline">
                      {s.journalEntryId.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
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
