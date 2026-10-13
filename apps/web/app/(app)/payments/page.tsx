import Link from 'next/link';
import { getTranslations, getFormatter } from 'next-intl/server';
import { Plus, Banknote } from 'lucide-react';
import { withSession } from '@/api/session';
import { Screen, PrimaryLink, TableFrame, Empty } from '@/ui/shell';
import { ButtonLink } from '@/ui/button';
import { Badge, type BadgeTone } from '@/ui/feedback';
import { DesktopOnly, MobileList, MobileListItem } from '@/ui/list';
import { noticeCode } from '@/ui/notice-code';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { Pagination } from '@/ui/pagination';

const STATUS_TONES: Record<string, BadgeTone> = {
  applied: 'success',
  voided: 'danger',
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ creado?: string; cursor?: string; limite?: string }>;
}) {
  const t = await getTranslations();
  const { creado, cursor, limite } = await searchParams;
  const createdCode = noticeCode(creado);
  const format = await getFormatter();
  const pageSize = limite ? Math.min(100, Math.max(5, parseInt(limite, 10) || 50)) : 50;

  const { ctx, data: page } = await withSession((queries) =>
    queries.payments.list({
      limit: pageSize,
      ...(cursor !== undefined ? { cursor } : {}),
    }),
  );

  if (!can(ctx.actor, 'payment:read') || page === null) {
    return (
      <Screen title={t('payments.title')}>
        <NoAccess />
      </Screen>
    );
  }

  const canReceive = can(ctx.actor, 'payment:receive');

  const statusBadge = (status: string) => (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{t(`payments.statuses.${status}`)}</Badge>
  );

  const methodLabel = (method: string) => t(`payments.methods.${method}`);

  return (
    <Screen
      title={t('payments.title')}
      subtitle={t('payments.subtitle')}
      {...(createdCode !== null ? { toast: t('payments.created', { number: createdCode }) } : {})}
      action={
        canReceive ? (
          <PrimaryLink href="/payments/new">
            <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
            {t('payments.new')}
          </PrimaryLink>
        ) : undefined
      }
    >
      {page.items.length === 0 ? (
        <Empty
          icon={Banknote}
          action={
            canReceive ? (
              <ButtonLink href="/payments/new" size="sm">
                <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                {t('payments.new')}
              </ButtonLink>
            ) : undefined
          }
        >
          {t('payments.empty')}
        </Empty>
      ) : (
        <>
          <DesktopOnly>
            <TableFrame>
              <thead>
                <tr className="border-b border-line bg-subtle/60">
                  <th scope="col" className={TH}>
                    {t('payments.number')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('payments.customer')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('payments.method')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('payments.reference')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('payments.status')}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {t('payments.amount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-subtle/40"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/payments/${payment.id}`}
                        className="font-mono text-xs font-medium text-brand underline-offset-2 hover:underline"
                      >
                        {payment.number}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted">
                        {format.dateTime(payment.paidAt, { dateStyle: 'medium' })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{payment.customerName}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft">
                      {methodLabel(payment.paymentMethod)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {payment.reference || '—'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(payment.status)}</td>
                    <td
                      className={`px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums ${
                        payment.status === 'voided' ? 'text-muted line-through' : ''
                      }`}
                    >
                      $ {payment.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </DesktopOnly>

          <MobileList>
            {page.items.map((payment) => (
              <MobileListItem
                key={payment.id}
                href={`/payments/${payment.id}`}
                title={<span className="font-mono text-sm">{payment.number}</span>}
                subtitle={`${payment.customerName} · ${format.dateTime(payment.paidAt, { dateStyle: 'medium' })}`}
                trailing={`$ ${payment.amount}`}
                trailingHint={statusBadge(payment.status)}
              />
            ))}
          </MobileList>

          <Pagination
            nextCursor={page.nextCursor}
            currentCursor={cursor}
            basePath="/payments"
            itemCount={page.items.length}
            pageSize={pageSize}
            params={{ ...(limite ? { limite } : {}) }}
          />
        </>
      )}
    </Screen>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';
