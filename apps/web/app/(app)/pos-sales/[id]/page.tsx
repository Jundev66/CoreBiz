import Link from 'next/link';
import { getFormatter } from 'next-intl/server';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiForRequest } from '@/api/session';
import { get } from '@/api/client';
import { Screen, TableFrame } from '@/ui/shell';
import { Badge, type BadgeTone } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

interface PosSaleDetail {
  readonly id: string;
  readonly ticketNumber: string;
  readonly status: string;
  readonly paymentMethod: string;
  readonly subtotal: string;
  readonly tax: string;
  readonly total: string;
  readonly occurredAt: string;
  readonly postedAt: string;
  readonly lines: readonly {
    readonly id: string;
    readonly productId: string | null;
    readonly name: string;
    readonly quantity: string;
    readonly unitPrice: string;
    readonly lineTotal: string;
  }[];
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia / Pago Móvil',
  split: 'Pago Mixto',
};

const PAYMENT_METHOD_TONES: Record<string, BadgeTone> = {
  cash: 'success',
  card: 'brand',
  transfer: 'neutral',
  split: 'warn',
};

export default async function PosSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'delivery_note:read')) {
    return (
      <Screen title="Detalle de Venta POS">
        <NoAccess />
      </Screen>
    );
  }

  const format = await getFormatter();
  const sale = await get<PosSaleDetail>(`/v1/pos/sales/${encodeURIComponent(id)}`);

  return (
    <Screen
      title={`Ticket ${sale.ticketNumber}`}
      subtitle={`Venta completada el ${format.dateTime(new Date(sale.occurredAt), { dateStyle: 'full', timeStyle: 'short' })}`}
      action={
        <Link
          href="/pos-sales"
          className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ArrowLeft className="size-3.5" />
          Volver a Ventas
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-card border border-line bg-surface p-4">
            <span className="text-xs text-muted block mb-1">Estado de la Venta</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <span className="text-sm font-semibold text-ink capitalize">
                {sale.status === 'completed' ? 'Cobrado / Completado' : sale.status}
              </span>
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <span className="text-xs text-muted block mb-1">Método de Pago</span>
            <div className="flex items-center gap-2">
              <Badge tone={PAYMENT_METHOD_TONES[sale.paymentMethod] ?? 'neutral'}>
                {PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
              </Badge>
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <span className="text-xs text-muted block mb-1">Total Pagado</span>
            <span className="text-lg font-bold font-mono text-ink">$ {sale.total}</span>
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-line bg-subtle/50">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Productos Cobrados
            </h3>
          </div>

          <TableFrame>
            <thead>
              <tr className="border-b border-line bg-subtle/40 text-xs font-semibold text-muted uppercase">
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4 text-right">Cantidad</th>
                <th className="py-3 px-4 text-right">Precio Unitario</th>
                <th className="py-3 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-xs text-ink">
              {sale.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-3 px-4 font-medium text-ink">{line.name}</td>
                  <td className="py-3 px-4 text-right font-mono text-ink">{line.quantity}</td>
                  <td className="py-3 px-4 text-right font-mono text-muted">$ {line.unitPrice}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-ink">
                    $ {line.lineTotal}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-subtle/30 text-xs font-semibold">
                <td colSpan={3} className="py-3 px-4 text-right text-muted">
                  Subtotal:
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink">$ {sale.subtotal}</td>
              </tr>
              {sale.tax !== '0.00' && (
                <tr className="border-t border-line bg-subtle/30 text-xs font-semibold">
                  <td colSpan={3} className="py-3 px-4 text-right text-muted">
                    Impuestos:
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-ink">$ {sale.tax}</td>
                </tr>
              )}
              <tr className="border-t-2 border-line bg-subtle/60 text-sm font-bold">
                <td colSpan={3} className="py-3 px-4 text-right text-ink">
                  Total Final:
                </td>
                <td className="py-3 px-4 text-right font-mono text-brand">$ {sale.total}</td>
              </tr>
            </tfoot>
          </TableFrame>
        </div>
      </div>
    </Screen>
  );
}
