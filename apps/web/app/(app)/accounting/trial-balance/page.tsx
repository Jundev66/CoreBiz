import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { getTrialBalance } from '@/api/accounting';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, CheckCircle2, AlertOctagon } from 'lucide-react';

function formatMinor(minorStr: string, currency = 'USD'): string {
  const minor = BigInt(minorStr);
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major}.${cents} ${currency}`;
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Balance de Comprobación">
        <NoAccess />
      </Screen>
    );
  }

  const { currency: queryCurrency } = await searchParams;
  const currency = queryCurrency ?? 'USD';
  const start = new Date(0);
  const end = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const trialBalance = await getTrialBalance(start, end, currency).catch(() => null);

  return (
    <Screen
      title="Balance de Comprobación"
      subtitle="Verificación matemática de partida doble y saldos por cuenta contable"
      action={
        <Link
          href="/accounting"
          className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
        >
          <ArrowLeft className="size-3.5" />
          <span>Volver al Catálogo</span>
        </Link>
      }
    >
      {trialBalance === null || trialBalance.accounts.length === 0 ? (
        <Empty>Aún no existen asientos contables con movimientos en la moneda seleccionada.</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className={`flex items-center justify-between rounded-control border p-4 ${
              trialBalance.isBalanced
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            }`}
          >
            <div className="flex items-center gap-3">
              {trialBalance.isBalanced ? (
                <CheckCircle2 className="size-5 shrink-0" />
              ) : (
                <AlertOctagon className="size-5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-semibold">
                  {trialBalance.isBalanced
                    ? 'Balance Cuadrado: Partida Doble Verificada'
                    : 'Descuadre Contable Detectado'}
                </p>
                <p className="text-xs opacity-90">
                  Total Débitos: {formatMinor(trialBalance.totalDebitMinor, currency)} | Total
                  Créditos: {formatMinor(trialBalance.totalCreditMinor, currency)}
                </p>
              </div>
            </div>
            <Badge tone={trialBalance.isBalanced ? 'success' : 'danger'}>
              {trialBalance.isBalanced ? 'Equilibrado' : 'Descuadrado'}
            </Badge>
          </div>

          <TableFrame>
            <thead>
              <tr className="border-b border-border bg-surface-raised/40 text-xs font-medium text-text-muted">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Cuenta Contable</th>
                <th className="px-4 py-3">Naturaleza</th>
                <th className="px-4 py-3 text-right">Débitos Acumulados</th>
                <th className="px-4 py-3 text-right">Créditos Acumulados</th>
                <th className="px-4 py-3 text-right">Saldo Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-xs">
              {trialBalance.accounts.map((acc) => (
                <tr key={acc.accountId} className="hover:bg-surface-raised/20 transition-colors">
                  <td className="px-4 py-3 font-semibold text-brand">{acc.code}</td>
                  <td className="px-4 py-3 font-sans font-medium text-text">{acc.name}</td>
                  <td className="px-4 py-3 font-sans">
                    <Badge tone="neutral">
                      {acc.normalSide === 'DEBIT' ? 'Deudora' : 'Acreedora'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMinor(acc.totalDebitMinor, currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMinor(acc.totalCreditMinor, currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMinor(acc.netBalanceMinor, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-raised/60 font-mono text-xs font-bold text-text">
                <td colSpan={3} className="px-4 py-3 font-sans text-right">
                  Totales Verificados:
                </td>
                <td className="px-4 py-3 text-right">
                  {formatMinor(trialBalance.totalDebitMinor, currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatMinor(trialBalance.totalCreditMinor, currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  {trialBalance.isBalanced ? '0.00 ' + currency : 'DESBALANCE'}
                </td>
              </tr>
            </tfoot>
          </TableFrame>
        </div>
      )}
    </Screen>
  );
}
