import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { Screen, Empty } from '@/ui/shell';
import { NoAccess } from '@/ui/no-access';
import { ChartOfAccountsView } from '@/ui/chart-of-accounts-view';
import { can } from '@corebiz/domain';
import { BarChart3, BookOpen, ArrowRightLeft, UserMinus } from 'lucide-react';

export default async function AccountingPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Plan de Cuentas">
        <NoAccess />
      </Screen>
    );
  }

  const accounts = await listAccounts().catch(() => []);
  const canWrite = can(ctx.actor, 'accounting:write');

  return (
    <Screen
      title="Plan de Cuentas"
      subtitle="Árbol contable ramificado por tipo de cuenta y estructura de partida doble"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/accounting/trial-balance"
            className="flex items-center gap-2 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <BarChart3 className="size-3.5" />
            <span>Balance de Comprobación</span>
          </Link>
          <Link
            href="/accounting/journal-entries"
            className="flex items-center gap-2 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <BookOpen className="size-3.5" />
            <span>Libro Diario</span>
          </Link>
          <Link
            href="/accounting/treasury"
            className="flex items-center gap-2 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <ArrowRightLeft className="size-3.5" />
            <span>Tesorería & Swaps</span>
          </Link>
          <Link
            href="/accounting/drawings"
            className="flex items-center gap-2 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <UserMinus className="size-3.5" />
            <span>Retiros de Socios</span>
          </Link>
        </div>
      }
    >
      {accounts.length === 0 ? (
        <Empty>No se han configurado cuentas contables para este tenant.</Empty>
      ) : (
        <ChartOfAccountsView accounts={accounts} canWrite={canWrite} />
      )}
    </Screen>
  );
}
