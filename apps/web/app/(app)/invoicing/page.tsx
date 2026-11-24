import { apiForRequest } from '@/api/session';
import { listInvoices } from '@/api/invoicing';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { Receipt, ShieldCheck } from 'lucide-react';

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

  return (
    <Screen
      title="Facturación Fiscal"
      subtitle="Emisión y auditoría tributaria de facturas, notas de crédito y control legal"
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
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Screen>
  );
}
