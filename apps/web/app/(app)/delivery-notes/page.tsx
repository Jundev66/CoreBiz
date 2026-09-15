import Link from 'next/link';
import { getTranslations, getFormatter } from 'next-intl/server';
import { Plus, Receipt } from 'lucide-react';
import { withSession } from '@/api/session';
import { Screen, PrimaryLink, TableFrame, Empty } from '@/ui/shell';
import { ButtonLink } from '@/ui/button';
import { Badge, type BadgeTone } from '@/ui/feedback';
import { DesktopOnly, MobileList, MobileListItem } from '@/ui/list';
import { noticeCode } from '@/ui/notice-code';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

/** Colores del estado. Nunca se comunica solo con color: siempre acompaña un texto. */
const STATUS_TONES: Record<string, BadgeTone> = {
  draft: 'neutral',
  issued: 'brand',
  delivered: 'success',
  voided: 'danger',
};

export default async function DeliveryNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ creado?: string }>;
}) {
  const t = await getTranslations();
  const { creado } = await searchParams;
  const createdCode = noticeCode(creado);
  const format = await getFormatter();
  const { ctx, data: page } = await withSession((queries) =>
    queries.deliveryNotes.list({ limit: 50 }),
  );

  /*
   * The session and the list travel together; the role still decides what is shown. A 403
   * from the API arrives as `null` and becomes a notice. See `@/ui/no-access`.
   */
  if (!can(ctx.actor, 'delivery_note:read') || page === null) {
    return (
      <Screen title={t('deliveryNotes.title')}>
        <NoAccess />
      </Screen>
    );
  }

  const statusBadge = (status: string) => (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{t(`deliveryNotes.statuses.${status}`)}</Badge>
  );

  return (
    <Screen
      title={t('deliveryNotes.title')}
      subtitle={t('deliveryNotes.subtitle')}
      {...(createdCode !== null
        ? { toast: t('deliveryNotes.created', { number: createdCode }) }
        : {})}
      action={
        <PrimaryLink href="/delivery-notes/new">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
          {t('deliveryNotes.new')}
        </PrimaryLink>
      }
    >
      {page.items.length === 0 ? (
        <Empty
          icon={Receipt}
          action={
            <ButtonLink href="/delivery-notes/new" size="sm">
              <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
              {t('deliveryNotes.new')}
            </ButtonLink>
          }
        >
          {t('deliveryNotes.empty')}
        </Empty>
      ) : (
        <>
          <DesktopOnly>
            <TableFrame>
              <thead>
                <tr className="border-b border-line bg-subtle/60">
                  <th scope="col" className={TH}>
                    {t('deliveryNotes.number')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('deliveryNotes.customer')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('deliveryNotes.status')}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {t('deliveryNotes.total')}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {t('deliveryNotes.totalBs')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((note) => (
                  <tr
                    key={note.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-subtle/40"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {/* The link text is ONLY the number: lists and tests open a note by it. */}
                      <Link
                        href={`/delivery-notes/${note.id}`}
                        className="font-mono text-xs font-medium text-brand underline-offset-2 hover:underline"
                      >
                        {note.number}
                      </Link>
                      {note.issuedAt && (
                        <span className="mt-0.5 block text-xs text-muted">
                          {format.dateTime(note.issuedAt, { dateStyle: 'medium' })}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{note.customerName}</td>
                    <td className="px-4 py-3">{statusBadge(note.status)}</td>
                    <td
                      className={`px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums ${note.status === 'voided' ? 'text-muted line-through' : ''}`}
                    >
                      $ {note.total}
                    </td>
                    {/* El equivalente en bolivares usa la tasa CONGELADA del documento,
                        no la vigente hoy. Ver ADR 002. */}
                    <td className="px-4 py-3 text-right whitespace-nowrap text-muted tabular-nums">
                      Bs {note.totalSecondary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </DesktopOnly>

          <MobileList>
            {page.items.map((note) => (
              <MobileListItem
                key={note.id}
                href={`/delivery-notes/${note.id}`}
                title={<span className="font-mono text-sm">{note.number}</span>}
                subtitle={
                  note.issuedAt
                    ? `${note.customerName} · ${format.dateTime(note.issuedAt, { dateStyle: 'medium' })}`
                    : note.customerName
                }
                trailing={`$ ${note.total}`}
                trailingHint={statusBadge(note.status)}
              />
            ))}
          </MobileList>
        </>
      )}
    </Screen>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';
