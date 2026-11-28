import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listAccounts, listJournalEntries } from '@/api/accounting';
import { listTreasurySwaps } from '@/api/treasury';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { Card, SectionTitle, Stat } from '@/ui/primitives';
import { buttonClasses } from '@/ui/button';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, ArrowRightLeft, ShieldCheck, Wallet } from 'lucide-react';
import { filterLiquidAssetAccounts } from '@/ui/account-filters';
import { TreasurySwapForm } from '@/ui/treasury-swap-form';

export default async function TreasurySwapsPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Operaciones de Tesorería & Criptoactivos">
        <NoAccess />
      </Screen>
    );
  }

  const [swaps, accounts, journalEntries] = await Promise.all([
    listTreasurySwaps().catch(() => []),
    listAccounts().catch(() => []),
    listJournalEntries().catch(() => []),
  ]);

  const balanceByAccountCurrency = new Map<string, bigint>();
  for (const entry of journalEntries) {
    for (const line of entry.lines) {
      const key = `${line.accountId}:${line.currency}`;
      const prev = balanceByAccountCurrency.get(key) ?? 0n;
      const delta = BigInt(line.debitMinor || '0') - BigInt(line.creditMinor || '0');
      balanceByAccountCurrency.set(key, prev + delta);
    }
  }

  const assetAccounts = filterLiquidAssetAccounts(accounts);
  const expenseAccounts = accounts.filter((a) => a.category === 'EXPENSE' || a.category === 'COGS');
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const sourceCandidates = assetAccounts.filter((a) => {
    const code = a.code.toLowerCase();
    const name = a.name.toLowerCase();
    if (name.includes('usdt') || name.includes('wallet') || name.includes('crypto')) return false;
    if (code === '1.1.04' || code.startsWith('1.1.04')) return false;
    if (
      code === '1.1.01.01' ||
      name.includes('zelle') ||
      (name.includes('usd') && !name.includes('ves'))
    )
      return false;
    return true;
  });
  const sourceAccounts = sourceCandidates.length > 0 ? sourceCandidates : assetAccounts;

  const targetCandidates = assetAccounts.filter((a) => {
    const code = a.code.toLowerCase();
    const name = a.name.toLowerCase();
    if (code === '1.1.01.02' || name.includes('nacional ves') || name.includes('bolívar'))
      return false;
    return true;
  });
  const targetAccounts = targetCandidates.length > 0 ? targetCandidates : assetAccounts;

  const defaultSourceAccount =
    sourceAccounts.find((a) => a.code === '1.1.01.02') ??
    sourceAccounts.find((a) => a.code.startsWith('1.1.01') || a.code === '1010') ??
    sourceAccounts[0];
  const defaultTargetAccount =
    targetAccounts.find((a) => a.code === '1.1.04.01' && a.id !== defaultSourceAccount?.id) ??
    targetAccounts.find((a) => a.code === '1.1.01.01' && a.id !== defaultSourceAccount?.id) ??
    targetAccounts.find((a) => a.id !== defaultSourceAccount?.id) ??
    targetAccounts[0];
  const defaultFeeAccount =
    expenseAccounts.find((a) => a.code.startsWith('6.1.02') || a.code === '6050') ??
    expenseAccounts[0];
  const defaultExchangeRate = ctx.settings.exchangeRateScaled
    ? Number(ctx.settings.exchangeRateScaled) / 100_000_000
    : 50;

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
          <TreasurySwapForm
            sourceAccounts={sourceAccounts.map((a) => ({
              id: a.id,
              code: a.code,
              name: a.name,
              usdMinor: (balanceByAccountCurrency.get(`${a.id}:USD`) ?? 0n).toString(),
              vesMinor: (balanceByAccountCurrency.get(`${a.id}:VES`) ?? 0n).toString(),
            }))}
            targetAccounts={targetAccounts.map((a) => ({
              id: a.id,
              code: a.code,
              name: a.name,
              usdMinor: (balanceByAccountCurrency.get(`${a.id}:USD`) ?? 0n).toString(),
              vesMinor: (balanceByAccountCurrency.get(`${a.id}:VES`) ?? 0n).toString(),
            }))}
            expenseAccounts={expenseAccounts.map((a) => ({
              id: a.id,
              code: a.code,
              name: a.name,
            }))}
            defaultSourceId={defaultSourceAccount?.id ?? ''}
            defaultTargetId={defaultTargetAccount?.id ?? ''}
            defaultFeeId={defaultFeeAccount?.id ?? ''}
            defaultExchangeRate={defaultExchangeRate}
          />
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
