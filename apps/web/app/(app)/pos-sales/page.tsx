import Link from 'next/link';
import { getFormatter } from 'next-intl/server';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { apiForRequest } from '@/api/session';
import { get } from '@/api/client';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge, type BadgeTone } from '@/ui/feedback';
import { DesktopOnly, MobileList, MobileListItem } from '@/ui/list';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

export interface PosSaleListItem {
  readonly id: string;
  readonly ticketNumber: string;
  readonly status: string;
  readonly paymentMethod: string;
  readonly subtotal: string;
  readonly tax: string;
  readonly total: string;
  readonly linesCount: number;
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

export default async function PosSalesPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'delivery_note:read')) {
    return (
      <Screen title="Ventas de Caja (POS)">
        <NoAccess />
      </Screen>
    );
  }

  const format = await getFormatter();
  const sales = await get<readonly PosSaleListItem[]>('/v1/pos/sales').catch(
    () => [] as readonly PosSaleListItem[],
  );

  return (
    <Screen
      title="Ventas de Caja (Mostrador)"
      subtitle="Tickets cobrados en terminales de punto de venta físico"
      action={
        <Link
          href="/pos"
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-control bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand/90"
        >
          <ShoppingCart className="size-3.5" />
          Abrir Terminal POS
        </Link>
      }
    >
      <div className="space-y-6">
        {sales.length === 0 ? (
          <Empty icon={ShoppingCart}>
            <div className="max-w-sm">
              <h3 className="text-sm font-semibold text-ink">
                Sin tickets de mostrador sincronizados
              </h3>
              <p className="mt-1 text-xs text-muted">
                Las ventas realizadas en la terminal de caja aparecerán aquí inmediatamente al
                sincronizarse.
              </p>
            </div>
          </Empty>
        ) : (
          <>
            <MobileList>
              {sales.map((sale) => (
                <MobileListItem
                  key={sale.id}
                  href={`/pos-sales/${sale.id}`}
                  title={sale.ticketNumber}
                  subtitle={`${PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod} · ${format.dateTime(new Date(sale.occurredAt), { dateStyle: 'short', timeStyle: 'short' })}`}
                  trailing={`$ ${sale.total}`}
                />
              ))}
            </MobileList>

            <DesktopOnly>
              <TableFrame>
                <thead>
                  <tr className="border-b border-line bg-subtle/60 text-xs font-semibold text-muted uppercase">
                    <th className="py-3 px-4">Ticket</th>
                    <th className="py-3 px-4">Fecha y Hora</th>
                    <th className="py-3 px-4">Método de Pago</th>
                    <th className="py-3 px-4 text-center">Productos</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                    <th className="py-3 px-4 text-right">Total Cobrado</th>
                    <th className="py-3 px-4 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs text-ink">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-subtle/40 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-ink">
                        {sale.ticketNumber}
                      </td>
                      <td className="py-3 px-4 text-muted">
                        {format.dateTime(new Date(sale.occurredAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <Badge tone={PAYMENT_METHOD_TONES[sale.paymentMethod] ?? 'neutral'}>
                          {PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-muted">
                        {sale.linesCount} producto(s)
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-muted">
                        $ {sale.subtotal}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-ink">
                        $ {sale.total}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Link
                          href={`/pos-sales/${sale.id}`}
                          className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft transition"
                        >
                          Ver
                          <ArrowRight className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            </DesktopOnly>
          </>
        )}
      </div>
    </Screen>
  );
}
