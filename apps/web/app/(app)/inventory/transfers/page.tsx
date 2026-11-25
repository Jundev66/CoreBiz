import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listWarehouses, listTransfers } from '@/api/inventory';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, Truck, Building2 } from 'lucide-react';

function transferStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return <Badge tone="success">Completado</Badge>;
    case 'IN_TRANSIT':
      return <Badge tone="warn">En Tránsito</Badge>;
    case 'DRAFT':
      return <Badge tone="neutral">Borrador</Badge>;
    case 'CANCELLED':
      return <Badge tone="danger">Cancelado</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

export default async function TransfersPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'stock:read')) {
    return (
      <Screen title="Traslados de Inventario">
        <NoAccess />
      </Screen>
    );
  }

  const [warehouses, transfers] = await Promise.all([
    listWarehouses().catch(() => []),
    listTransfers().catch(() => []),
  ]);

  const whMap = new Map(warehouses.map((w) => [w.id, w.name]));

  return (
    <Screen
      title="Depósitos & Traslados de Mercancía"
      subtitle="Control de existencias multidepósito y transferencias entre sucursales"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/inventory/audits"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <span>Ver Tomas Físicas</span>
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
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Depósitos Habilitados ({warehouses.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {warehouses.map((wh) => (
              <div
                key={wh.id}
                className="flex items-start justify-between rounded-card border border-line bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 items-center justify-center rounded-control bg-brand-soft text-brand">
                    <Building2 className="size-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-text">{wh.name}</span>
                    <span className="text-xs text-text-muted">Código: {wh.code}</span>
                    {wh.address && (
                      <span className="mt-1 text-xs text-text-muted">{wh.address}</span>
                    )}
                  </div>
                </div>
                {wh.isDefault && <Badge tone="brand">Principal</Badge>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Historial de Traslados ({transfers.length})
          </h2>
          {transfers.length === 0 ? (
            <Empty icon={Truck}>Aún no se han registrado traslados entre depósitos.</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-line bg-surface-raised text-xs font-semibold text-text-muted">
                  <th className="px-4 py-3">Nº Traslado</th>
                  <th className="px-4 py-3">Depósito Origen</th>
                  <th className="px-4 py-3">Depósito Destino</th>
                  <th className="px-4 py-3 text-center">Líneas</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Iniciado</th>
                  <th className="px-4 py-3">Completado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {transfers.map((trf) => (
                  <tr key={trf.id} className="hover:bg-brand-soft/20">
                    <td className="px-4 py-3 font-mono font-medium text-text">
                      {trf.transferNumber}
                    </td>
                    <td className="px-4 py-3 text-text">
                      {whMap.get(trf.sourceWarehouseId) ?? trf.sourceWarehouseId}
                    </td>
                    <td className="px-4 py-3 text-text">
                      {whMap.get(trf.destinationWarehouseId) ?? trf.destinationWarehouseId}
                    </td>
                    <td className="px-4 py-3 text-center text-text font-medium">
                      {trf.lines.length}
                    </td>
                    <td className="px-4 py-3">{transferStatusBadge(trf.status)}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {trf.initiatedAt
                        ? new Date(trf.initiatedAt).toLocaleDateString('es-VE')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {trf.completedAt
                        ? new Date(trf.completedAt).toLocaleDateString('es-VE')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </div>
      </div>
    </Screen>
  );
}
