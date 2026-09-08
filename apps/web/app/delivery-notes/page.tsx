import Link from 'next/link';
import { getTranslations, getFormatter } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell, QuotaBar, PrimaryLink, TableFrame, Empty } from '@/ui/shell';

/** Colores del estado. Nunca se comunica solo con color: siempre acompaña un texto. */
const STATUS_STYLES: Record<string, string> = {
  draft: 'border-[var(--color-line)] text-[var(--color-muted)]',
  issued: 'border-[var(--color-brand)] text-[var(--color-brand)]',
  delivered: 'border-[var(--color-brand)] text-[var(--color-brand)]',
  voided: 'border-[var(--color-danger)] text-[var(--color-danger-ink)] line-through',
};

export default async function DeliveryNotesPage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx, session, queries } = await apiForRequest();

  const page = await queries.deliveryNotes.list({ limit: 50 });
  const quota = ctx.plan.quota('documents_month', await queries.usage.current('documents_month'));

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('deliveryNotes.title')}
      subtitle={t('deliveryNotes.subtitle')}
      action={
        <div className="flex items-end gap-6">
          <QuotaBar
            current={quota.current}
            limit={quota.limit}
            label={t('quota.monthly', { current: quota.current, limit: quota.limit })}
            nearLimitLabel={t('quota.nearLimit')}
          />
          <PrimaryLink href="/delivery-notes/new">{t('deliveryNotes.new')}</PrimaryLink>
        </div>
      }
    >
      {page.items.length === 0 ? (
        <Empty>{t('deliveryNotes.empty')}</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
              <th scope="col" className="px-4 py-3 font-medium">
                {t('deliveryNotes.number')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('deliveryNotes.customer')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('deliveryNotes.status')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('deliveryNotes.total')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('deliveryNotes.totalBs')}
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((note) => (
              <tr key={note.id} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/delivery-notes/${note.id}`}
                    className="font-mono text-xs underline-offset-2 hover:underline"
                  >
                    {note.number}
                  </Link>
                  {note.issuedAt && (
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      {format.dateTime(note.issuedAt, { dateStyle: 'medium' })}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{note.customerName}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[note.status] ?? ''}`}
                  >
                    {t(`deliveryNotes.statuses.${note.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">$ {note.total}</td>
                {/* El equivalente en bolivares usa la tasa CONGELADA del documento,
                    no la vigente hoy. Ver ADR 002. */}
                <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">
                  Bs {note.totalSecondary}
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Shell>
  );
}
