import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listInventoryAudits, listWarehouses } from '@/api/inventory';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, ClipboardList, EyeOff, AlertTriangle, CheckCircle2 } from 'lucide-react';

function auditStatusBadge(status: string) {
  switch (status) {
    case 'APPROVED':
      return <Badge tone="success">Aprobada</Badge>;
    case 'IN_REVIEW':
      return <Badge tone="warn">En Revisión</Badge>;
    case 'OPEN':
      return <Badge tone="brand">Abierta</Badge>;
    case 'CANCELLED':
      return <Badge tone="danger">Cancelada</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

export default async function InventoryAuditsPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'stock:read')) {
    return (
      <Screen title="Tomas Físicas de Inventario">
        <NoAccess />
      </Screen>
    );
  }

  const [audits, warehouses] = await Promise.all([
    listInventoryAudits().catch(() => []),
    listWarehouses().catch(() => []),
  ]);

  const whMap = new Map(warehouses.map((w) => [w.id, w.name]));

  return (
    <Screen
      title="Tomas Físicas & Mermas de Inventario"
      subtitle="Auditorías de conteo físico, conciliación de discrepancias y asientos de mermas"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/inventory/transfers"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <span>Ver Traslados</span>
          </Link>
          <Link
            href="/products"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <ArrowLeft className="size-3.5" />
            <span>Productos</span>
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {audits.length === 0 ? (
          <Empty icon={ClipboardList}>
            Aún no se han programado órdenes de toma física de inventario.
          </Empty>
        ) : (
          <TableFrame>
            <thead>
              <tr className="border-b border-line bg-surface-raised text-xs font-semibold text-text-muted">
                <th className="px-4 py-3">Nº Auditoría</th>
                <th className="px-4 py-3">Depósito</th>
                <th className="px-4 py-3 text-center">Conteo Ciego</th>
                <th className="px-4 py-3 text-center">Items</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Discrepancias</th>
                <th className="px-4 py-3">Fecha Creación</th>
                <th className="px-4 py-3">Asiento Contable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {audits.map((audit) => (
                <tr key={audit.id} className="hover:bg-brand-soft/20">
                  <td className="px-4 py-3 font-mono font-medium text-text">{audit.auditNumber}</td>
                  <td className="px-4 py-3 text-text">
                    {whMap.get(audit.warehouseId) ?? audit.warehouseId}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {audit.blindCount ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-400">
                        <EyeOff className="size-3.5" />
                        <span>Ciego</span>
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">Estándar</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-text font-medium">
                    {audit.lines.length}
                  </td>
                  <td className="px-4 py-3">{auditStatusBadge(audit.status)}</td>
                  <td className="px-4 py-3">
                    {audit.status === 'OPEN' ? (
                      <span className="text-xs text-text-muted">Pendiente Conteo</span>
                    ) : audit.lines.some(
                        (l) => l.discrepancyQuantity && l.discrepancyQuantity !== '0.000',
                      ) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="size-3.5" />
                        <span>Con Diferencias</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />
                        <span>Exacto</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {new Date(audit.createdAt).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-text-muted">
                    {audit.journalEntryId ? (
                      <span className="text-brand font-medium">Ajuste Generado</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </div>
    </Screen>
  );
}
