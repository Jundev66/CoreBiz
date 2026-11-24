import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listJournalEntries, listAccounts } from '@/api/accounting';
import { Screen, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, Calendar, FileText } from 'lucide-react';

function formatMinor(minorStr: string, currency = 'USD'): string {
  const minor = BigInt(minorStr);
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major}.${cents} ${currency}`;
}

export default async function JournalEntriesPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Libro Diario">
        <NoAccess />
      </Screen>
    );
  }

  const [entries, accounts] = await Promise.all([
    listJournalEntries().catch(() => []),
    listAccounts().catch(() => []),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  return (
    <Screen
      title="Libro Diario"
      subtitle="Registro cronológico oficial de asientos contables por partida doble"
      action={
        <Link
          href="/accounting"
          className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
        >
          <ArrowLeft className="size-3.5" />
          <span>Volver al Catálogo</span>
        </Link>
      }
    >
      {entries.length === 0 ? (
        <Empty>Aún no se han generado asientos en el libro diario para este tenant.</Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col overflow-hidden rounded-control border border-border bg-surface"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-raised/40 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-brand">
                    Asiento #{entry.entryNumber}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Calendar className="size-3.5" />
                    <span>{new Date(entry.date).toLocaleDateString()}</span>
                  </div>
                  <Badge tone="neutral">{entry.sourceType}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-muted">Total:</span>
                  <span className="font-mono text-xs font-bold text-text">
                    {formatMinor(entry.totalDebitMinor)}
                  </span>
                </div>
              </div>

              <div className="px-4 py-2 text-xs font-medium text-text">
                <p className="flex items-center gap-1.5 text-text-muted">
                  <FileText className="size-3.5" />
                  <span className="font-semibold text-text">{entry.description}</span>
                  {entry.sourceId && (
                    <span className="font-mono text-text-muted">({entry.sourceId})</span>
                  )}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-t border-b border-border bg-surface-raised/20 text-text-muted">
                      <th className="px-4 py-2">Cuenta</th>
                      <th className="px-4 py-2">Glosa / Memo</th>
                      <th className="px-4 py-2 text-right">Débito</th>
                      <th className="px-4 py-2 text-right">Crédito</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {entry.lines.map((l, index) => {
                      const acc = accountMap.get(l.accountId);
                      const isDebit = BigInt(l.debitMinor) > 0n;
                      return (
                        <tr
                          key={`${entry.id}-line-${index}`}
                          className="hover:bg-surface-raised/10 transition-colors"
                        >
                          <td className="px-4 py-2 font-sans font-medium">
                            <span className="font-mono font-bold text-brand">
                              {acc?.code ?? l.accountId}
                            </span>{' '}
                            {acc?.name && <span className="text-text-muted">({acc.name})</span>}
                          </td>
                          <td className="px-4 py-2 font-sans text-text-muted">{l.memo ?? '—'}</td>
                          <td className="px-4 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {isDebit ? formatMinor(l.debitMinor, l.currency) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-sky-600 dark:text-sky-400">
                            {!isDebit ? formatMinor(l.creditMinor, l.currency) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </Screen>
  );
}
