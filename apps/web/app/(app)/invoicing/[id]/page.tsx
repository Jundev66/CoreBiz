import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Banknote, BookOpen, Eye, Receipt, ShieldCheck, Truck } from 'lucide-react';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { getInvoiceById, listInvoiceReceipts } from '@/api/invoicing';
import { listAccounts, listJournalEntries } from '@/api/accounting';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { buttonClasses } from '@/ui/button';
import { NoAccess } from '@/ui/no-access';
import { SectionTitle } from '@/ui/primitives';

function formatMinor(minorStr: string, currency = 'USD'): string {
  const minor = BigInt(minorStr || '0');
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

const SOURCE_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'Emisión de Factura',
  PAYMENT: 'Cobro / Abono',
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'invoice:read')) {
    return (
      <Screen title="Detalle de Factura" back={{ href: '/invoicing', label: 'Facturas de Venta' }}>
        <NoAccess />
      </Screen>
    );
  }

  const invoice = await getInvoiceById(id);
  if (!invoice) {
    notFound();
  }

  const canReadAccounting = can(ctx.actor, 'accounting:read');
  const [receipts, journalEntries, accounts] = await Promise.all([
    listInvoiceReceipts(id),
    canReadAccounting ? listJournalEntries().catch(() => []) : Promise.resolve([]),
    canReadAccounting ? listAccounts().catch(() => []) : Promise.resolve([]),
  ]);

  const accountById = new Map(accounts.map((acc) => [acc.id, acc]));
  const relatedEntries = journalEntries.filter((entry) => entry.sourceId === invoice.id);
  const canCollect =
    can(ctx.actor, 'invoice:write') &&
    (invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID');

  return (
    <Screen
      title={`Factura ${invoice.documentNumber}`}
      subtitle={`Emitida el ${new Date(invoice.issueDate).toLocaleDateString()} · Vencimiento ${new Date(invoice.dueDate).toLocaleDateString()}`}
      back={{ href: '/invoicing', label: 'Facturas de Venta' }}
      action={
        <div className="flex items-center gap-2">
          {canCollect && (
            <Link
              href={`/invoicing/${invoice.id}/collect`}
              className={buttonClasses({ size: 'sm' })}
            >
              <Banknote className="size-3.5" />
              <span>Registrar Cobro</span>
            </Link>
          )}
          <Link
            href={`/delivery-notes/new?customerId=${encodeURIComponent(invoice.customerId)}`}
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            <Truck className="size-3.5" />
            <span>Nota de Entrega</span>
          </Link>
        </div>
      }
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-card border border-line bg-surface p-4">
            <span className="mb-1 block text-xs text-muted">Estado</span>
            <Badge tone={STATUS_TONES[invoice.status] ?? 'neutral'}>
              {STATUS_LABELS[invoice.status] ?? invoice.status}
            </Badge>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <span className="mb-1 block text-xs text-muted">Condición</span>
            <span className="text-sm font-semibold text-ink">
              {invoice.paymentCondition === 'CASH' ? 'Contado' : 'Crédito'}
            </span>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <span className="mb-1 block text-xs text-muted">Control Fiscal</span>
            {invoice.controlNumber ? (
              <span className="inline-flex items-center gap-1 font-mono text-sm text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-3.5" />
                {invoice.controlNumber}
              </span>
            ) : (
              <span className="text-sm text-muted">—</span>
            )}
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <span className="mb-1 block text-xs text-muted">Total / Cobrado</span>
            <div className="font-mono text-sm font-bold text-ink">
              {formatMinor(invoice.totalMinor, invoice.currency)}
            </div>
            <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
              Cobrado: {formatMinor(invoice.paidMinor, invoice.currency)}
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <span className="mb-1 block text-xs text-muted">Saldo Pendiente</span>
            <span className="font-mono text-lg font-bold text-brand">
              {formatMinor(invoice.remainingBalanceMinor, invoice.currency)}
            </span>
          </div>
        </div>

        <section className="space-y-3">
          <SectionTitle>Líneas de Factura</SectionTitle>
          <TableFrame>
            <thead>
              <tr className="border-b border-line bg-subtle/40 text-xs font-semibold uppercase text-muted">
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Precio Unitario</th>
                <th className="px-4 py-3 text-right">Impuesto</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-xs text-ink">
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3 font-medium text-ink">{line.description}</td>
                  <td className="px-4 py-3 text-right font-mono">{line.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    {formatMinor(line.unitPriceMinor, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    {line.taxPercentage}%
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatMinor(line.subtotalMinor, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    {formatMinor(line.totalMinor, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-subtle/30 text-xs font-semibold">
                <td colSpan={5} className="px-4 py-2.5 text-right text-muted">
                  Subtotal:
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-ink">
                  {formatMinor(invoice.subtotalMinor, invoice.currency)}
                </td>
              </tr>
              <tr className="border-t border-line bg-subtle/30 text-xs font-semibold">
                <td colSpan={5} className="px-4 py-2.5 text-right text-muted">
                  Impuestos:
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-ink">
                  {formatMinor(invoice.taxMinor, invoice.currency)}
                </td>
              </tr>
              {invoice.igtfMinor !== '0' && (
                <tr className="border-t border-line bg-subtle/30 text-xs font-semibold">
                  <td colSpan={5} className="px-4 py-2.5 text-right text-muted">
                    IGTF:
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink">
                    {formatMinor(invoice.igtfMinor, invoice.currency)}
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-line bg-subtle/60 text-sm font-bold">
                <td colSpan={5} className="px-4 py-3 text-right text-ink">
                  Total Factura:
                </td>
                <td className="px-4 py-3 text-right font-mono text-brand">
                  {formatMinor(invoice.totalMinor, invoice.currency)}
                </td>
              </tr>
            </tfoot>
          </TableFrame>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Cobros y Recibos</SectionTitle>
            {canCollect && (
              <Link
                href={`/invoicing/${invoice.id}/collect`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                <Receipt className="size-3.5" />
                <span>Registrar abono</span>
              </Link>
            )}
          </div>
          {receipts.length === 0 ? (
            <Empty>
              {BigInt(invoice.paidMinor) > 0n
                ? `Se registraron cobros directos por ${formatMinor(invoice.paidMinor, invoice.currency)} (ver asientos contables debajo).`
                : 'Aún no hay recibos de cobro registrados para esta factura.'}
            </Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-line bg-subtle/40 text-xs font-semibold uppercase text-muted">
                  <th className="px-4 py-3">Nro. Recibo</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs text-ink">
                {receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{receipt.receiptNumber}</td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(receipt.receiptDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">{receipt.paymentMethod}</td>
                    <td className="px-4 py-3 font-mono text-muted">{receipt.reference ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {receipt.amount} {receipt.currency}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={receipt.status === 'VOID' ? 'danger' : 'success'}>
                        {receipt.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </section>

        {canReadAccounting && (
          <section className="space-y-3">
            <SectionTitle>Asientos Contables (Libro Diario)</SectionTitle>
            {relatedEntries.length === 0 ? (
              <Empty>No se encontraron asientos contables vinculados a esta factura.</Empty>
            ) : (
              <div className="space-y-4">
                {relatedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="overflow-hidden rounded-card border border-line bg-surface"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle/40 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs">
                        <BookOpen className="size-4 text-brand" />
                        <span className="font-mono font-bold text-ink">
                          Asiento #{entry.entryNumber}
                        </span>
                        <Badge tone="neutral">
                          {SOURCE_TYPE_LABELS[entry.sourceType] ?? entry.sourceType}
                        </Badge>
                        <span className="text-muted">{entry.description}</span>
                      </div>
                      <span className="text-xs text-muted">
                        {new Date(entry.date).toLocaleDateString()}
                      </span>
                    </div>
                    <TableFrame>
                      <thead>
                        <tr className="border-b border-line bg-subtle/20 text-xs font-semibold uppercase text-muted">
                          <th className="px-4 py-2.5">Cuenta</th>
                          <th className="px-4 py-2.5">Detalle</th>
                          <th className="px-4 py-2.5 text-right">Débito</th>
                          <th className="px-4 py-2.5 text-right">Crédito</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-xs text-ink">
                        {entry.lines.map((line, index) => {
                          const account = accountById.get(line.accountId);
                          return (
                            <tr key={`${entry.id}-${index}`}>
                              <td className="px-4 py-2.5 font-medium">
                                {account ? `${account.code} · ${account.name}` : line.accountId}
                              </td>
                              <td className="px-4 py-2.5 text-muted">{line.memo ?? '—'}</td>
                              <td className="px-4 py-2.5 text-right font-mono">
                                {line.debitMinor !== '0'
                                  ? formatMinor(line.debitMinor, line.currency)
                                  : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono">
                                {line.creditMinor !== '0'
                                  ? formatMinor(line.creditMinor, line.currency)
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </TableFrame>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="flex items-center gap-2 text-xs text-muted">
          <Eye className="size-3.5" />
          <span>Registro contable y fiscal de solo lectura.</span>
        </div>
      </div>
    </Screen>
  );
}
