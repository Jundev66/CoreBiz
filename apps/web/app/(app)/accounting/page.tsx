import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { BarChart3, BookOpen, Layers } from 'lucide-react';

const CATEGORY_NAMES: Record<string, string> = {
  ASSET: 'Activos',
  LIABILITY: 'Pasivos',
  EQUITY: 'Patrimonio',
  REVENUE: 'Ingresos',
  COGS: 'Costos de Venta',
  EXPENSE: 'Gastos de Operación',
};

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

  return (
    <Screen
      title="Plan de Cuentas"
      subtitle="Estructura contable oficial y catálogo de cuentas por partida doble"
      action={
        <div className="flex items-center gap-2">
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
        </div>
      }
    >
      {accounts.length === 0 ? (
        <Empty>No se han configurado cuentas contables para este tenant.</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-border bg-surface-raised/40 text-xs font-medium text-text-muted">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre de la Cuenta</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Naturaleza</th>
              <th className="px-4 py-3 text-center">Conciliable</th>
              <th className="px-4 py-3 text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {accounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-surface-raised/20 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-brand">{acc.code}</td>
                <td className="px-4 py-3 font-medium text-text">{acc.name}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                    <Layers className="size-3" />
                    {CATEGORY_NAMES[acc.category] ?? acc.category}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={acc.normalSide === 'DEBIT' ? 'neutral' : 'brand'}>
                    {acc.normalSide === 'DEBIT' ? 'Deudora (Débito)' : 'Acreedora (Crédito)'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center">
                  {acc.isReconcilable ? (
                    <span className="text-xs text-emerald-600 font-medium">Sí</span>
                  ) : (
                    <span className="text-xs text-text-muted">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Badge tone={acc.isActive ? 'success' : 'neutral'}>
                    {acc.isActive ? 'Activa' : 'Inactiva'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Screen>
  );
}
