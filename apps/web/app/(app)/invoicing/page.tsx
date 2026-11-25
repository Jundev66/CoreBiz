import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listInvoices } from '@/api/invoicing';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { buttonClasses } from '@/ui/button';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { Plus, Receipt, ShieldCheck, ShoppingCart, Truck } from 'lucide-react';
import { getPosTerminalUrl } from '@/ui/pos-link';

function formatMinor(minorStr: string, currency = 'USD'): string {
  const minor = BigInt(minorStr);
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major}.${cents} ${currency}`;
}

const STATUS_TONES: Record<string, 'neutral' | 'brand' | 'success' | 'warn' | 'danger'> = {
  DRAFT: 'neutral',
  ISSUED: 'brand',
  PARTIALLY_PAID: 'warn',
  PAID: 'success',
  VOID: 'danger',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitida',
  PARTIALLY_PAID: 'Abonada Parcial',
  PAID: 'Pagada Total',
  VOID: 'Anulada',
};

export default async function InvoicingPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'invoice:read')) {
    return (
      <Screen title="Facturación Fiscal">
        <NoAccess />
      </Screen>
    );
  }

  const invoices = await listInvoices().catch(() => []);

  const canWrite = can(ctx.actor, 'invoice:write');

  return (
    <Screen
      title="Facturas de Venta"
      subtitle="Emisión comercial, control fiscal y trazabilidad contable de ventas"
      action={
        <div className="flex items-center gap-2">
          <a
            href={getPosTerminalUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            <ShoppingCart className="size-3.5" />
            <span>Terminal POS</span>
          </a>
          <Link
            href="/invoicing/credit-notes"
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            Notas de Crédito & Débito
          </Link>
          {canWrite && (
            <Link href="/invoicing/new" className={buttonClasses({ size: 'sm' })}>
              <Plus className="size-3.5" />
              <span>Nueva Factura</span>
            </Link>
          )}
        </div>
      }
    >
      {invoices.length === 0 ? (
        <Empty>Aún no se han generado facturas para este tenant.</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-border bg-surface-raised/40 text-xs font-medium text-text-muted">
              <th className="px-4 py-3">Nro. Factura</th>
              <th className="px-4 py-3">Control Fiscal</th>
              <th className="px-4 py-3">Fecha Emisión</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3 text-right">Subtotal</th>
              <th className="px-4 py-3 text-right">Impuestos</th>
              <th className="px-4 py-3 text-right">Total Factura</th>
              <th className="px-4 py-3 text-right">Cobrado</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-right">Despacho</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-surface-raised/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="size-4 text-brand" />
                    <span className="font-mono font-bold text-text">{inv.documentNumber}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {inv.controlNumber ? (
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="size-3" />
                      {inv.controlNumber}
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                  {new Date(inv.issueDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                  {new Date(inv.dueDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">
                  {formatMinor(inv.subtotalMinor, inv.currency)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">
                  {formatMinor(inv.taxMinor, inv.currency)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs font-bold text-text">
                  {formatMinor(inv.totalMinor, inv.currency)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                  {formatMinor(inv.paidMinor, inv.currency)}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge tone={STATUS_TONES[inv.status] ?? 'neutral'}>
                    {STATUS_LABELS[inv.status] ?? inv.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/delivery-notes/new?customerId=${encodeURIComponent(inv.customerId)}`}
                    className="inline-flex items-center gap-1 rounded-control border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-subtle"
                  >
                    <Truck className="size-3" />
                    <span>Nota de Entrega</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Screen>
  );
}
