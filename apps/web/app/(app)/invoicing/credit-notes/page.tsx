import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listCreditNotes, listDebitNotes } from '@/api/invoicing';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, FileText, RotateCcw, PlusCircle, Package } from 'lucide-react';

function formatMinor(minorStr: string, currency = 'USD'): string {
  const minor = BigInt(minorStr || '0');
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major.toLocaleString('es-VE')}.${cents} ${currency}`;
}

export default async function CreditDebitNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'invoice:read')) {
    return (
      <Screen title="Notas de Crédito y Débito">
        <NoAccess />
      </Screen>
    );
  }

  const { type: queryType } = await searchParams;
  const isDebit = queryType === 'debit';

  const [creditNotes, debitNotes] = await Promise.all([
    listCreditNotes().catch(() => []),
    listDebitNotes().catch(() => []),
  ]);

  const activeNotes = isDebit ? debitNotes : creditNotes;

  return (
    <Screen
      title="Notas de Crédito & Débito Fiscales"
      subtitle="Modificaciones fiscales a facturas emitidas, devoluciones y recargos con partida doble"
      action={
        <div className="flex items-center gap-2">
          <Link
            href={`/invoicing/credit-notes?type=${isDebit ? 'credit' : 'debit'}`}
            className="flex items-center gap-1.5 rounded-control border border-brand bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft/80"
          >
            {isDebit ? <RotateCcw className="size-3.5" /> : <PlusCircle className="size-3.5" />}
            <span>Ver Notas de {isDebit ? 'Crédito' : 'Débito'}</span>
          </Link>
          <Link
            href="/invoicing"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <ArrowLeft className="size-3.5" />
            <span>Facturación</span>
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link
            href="/invoicing/credit-notes?type=credit"
            className={`rounded-control px-4 py-2 text-sm font-semibold transition-colors ${
              !isDebit
                ? 'bg-brand text-brand-contrast'
                : 'border border-border bg-surface text-text hover:bg-surface-raised'
            }`}
          >
            Notas de Crédito ({creditNotes.length})
          </Link>
          <Link
            href="/invoicing/credit-notes?type=debit"
            className={`rounded-control px-4 py-2 text-sm font-semibold transition-colors ${
              isDebit
                ? 'bg-brand text-brand-contrast'
                : 'border border-border bg-surface text-text hover:bg-surface-raised'
            }`}
          >
            Notas de Débito ({debitNotes.length})
          </Link>
        </div>

        {activeNotes.length === 0 ? (
          <Empty icon={FileText}>
            No existen notas de {isDebit ? 'débito' : 'crédito'} registradas en el período.
          </Empty>
        ) : (
          <TableFrame>
            <thead>
              <tr className="border-b border-line bg-surface-raised text-xs font-semibold text-text-muted">
                <th className="px-4 py-3">Nº Documento</th>
                <th className="px-4 py-3">Factura Afectada</th>
                <th className="px-4 py-3">Motivo / Causa</th>
                {!isDebit && <th className="px-4 py-3 text-center">Reintegro Stock</th>}
                <th className="px-4 py-3 text-right">Subtotal</th>
                <th className="px-4 py-3 text-right">IVA</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {activeNotes.map((note) => (
                <tr key={note.id} className="hover:bg-brand-soft/20">
                  <td className="px-4 py-3 font-mono font-medium text-text">
                    {'creditNoteNumber' in note ? note.creditNoteNumber : note.debitNoteNumber}
                  </td>
                  <td className="px-4 py-3 font-mono text-text">{note.affectedInvoiceId}</td>
                  <td className="px-4 py-3 text-text">
                    <div className="flex flex-col">
                      <span className="font-medium">{note.reason}</span>
                      {note.reasonDetails && (
                        <span className="text-xs text-text-muted">{note.reasonDetails}</span>
                      )}
                    </div>
                  </td>
                  {!isDebit && (
                    <td className="px-4 py-3 text-center">
                      {'restockItems' in note && note.restockItems ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <Package className="size-3.5" />
                          <span>Reintegrado</span>
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">Sin reintegro</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right text-text">
                    {formatMinor(note.subtotalMinor, note.currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-text">
                    {formatMinor(note.taxTotalMinor, note.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-text">
                    {formatMinor(note.totalMinor, note.currency)}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {new Date(note.issueDate).toLocaleDateString('es-VE')}
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
