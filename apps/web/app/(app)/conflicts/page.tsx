import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw, ShoppingCart } from 'lucide-react';
import { getPosTerminalUrl } from '@/ui/pos-link';
import { apiForRequest } from '@/api/session';
import { get } from '@/api/client';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ConflictResolveModal, type ConflictViewItem } from '@/ui/conflict-resolve-modal';

export default async function ConflictsPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'stock:read')) {
    return (
      <Screen title="Inconsistencias POS">
        <NoAccess />
      </Screen>
    );
  }

  const conflicts = await get<readonly ConflictViewItem[]>('/v1/pos/conflicts');

  const openCount = conflicts.filter((c) => c.status === 'open').length;

  return (
    <Screen
      title="Inconsistencias y Sobreventas POS"
      subtitle="Supervisión de discrepancias de inventario registradas durante operaciones offline"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <ArrowLeft className="size-3.5" />
            Catálogo ERP
          </Link>
          <a
            href={getPosTerminalUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-control bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand/90"
          >
            <ShoppingCart className="size-3.5" />
            Terminal POS PWA
          </a>
        </div>
      }
    >
      <div className="space-y-6">
        {openCount > 0 && (
          <div className="flex items-center gap-3 rounded-card border border-warn/40 bg-warn-soft/50 p-4 text-xs text-warn-ink">
            <AlertTriangle className="size-5 shrink-0 text-warn-ink" />
            <div className="flex-1">
              <span className="font-semibold">
                {openCount} discrepancia(s) pendientes de resolución.
              </span>
              <span className="ml-1 text-muted">
                Las ventas se registraron y conservaron para no frenar la atención en caja, pero el
                inventario resultante requiere conciliación.
              </span>
            </div>
          </div>
        )}

        {conflicts.length === 0 ? (
          <Empty icon={RefreshCw}>
            <div className="max-w-sm">
              <h3 className="text-sm font-semibold text-ink">Sin inconsistencias de inventario</h3>
              <p className="mt-1 text-xs text-muted">
                Todas las ventas sincronizadas desde las cajas POS concuerdan exactamente con las
                existencias registradas.
              </p>
            </div>
          </Empty>
        ) : (
          <TableFrame>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-muted/50 text-muted uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Conflicto / Fecha</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-right">Stock Previo</th>
                  <th className="py-3 px-4 text-right">Cant. Vendida</th>
                  <th className="py-3 px-4 text-right">Stock Resultante</th>
                  <th className="py-3 px-4 text-right">Faltante</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {conflicts.map((conflict) => (
                  <tr key={conflict.id} className="hover:bg-surface-muted/30 transition">
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-ink">
                        {conflict.id.slice(0, 8)}...
                      </div>
                      <div className="text-muted text-[11px]">
                        {new Date(conflict.detectedAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded-full bg-slate-500/10 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {conflict.conflictType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-muted">
                      {conflict.stockBefore}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-ink">
                      {conflict.quantityAttempted}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-danger-ink">
                      {conflict.stockAfter}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      -{conflict.shortageQuantity}
                    </td>
                    <td className="py-3 px-4">
                      {conflict.status === 'open' ? (
                        <Badge tone="warn">Abierta</Badge>
                      ) : conflict.status === 'investigating' ? (
                        <Badge tone="brand">En Auditoría</Badge>
                      ) : (
                        <Badge tone="success">Resuelta</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {conflict.status !== 'resolved' ? (
                        <ConflictResolveModal conflict={conflict} />
                      ) : (
                        <span className="text-muted text-[11px]">Conciliada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </div>
    </Screen>
  );
}
