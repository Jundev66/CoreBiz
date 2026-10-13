import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { Banknote, Pencil } from 'lucide-react';
import { can } from '@corebiz/domain';
import { withSession } from '@/api/session';
import { setCustomerStatusAction } from '@/actions/customers';
import { Screen, TableFrame } from '@/ui/shell';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { DetailList, StatusBadge, StatusToggle } from '@/ui/detail';
import { Card } from '@/ui/primitives';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('customers.detail') };
}

/**
 * Ficha de un cliente con sus datos, saldos y cuentas por cobrar.
 */
export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string }>;
}) {
  const t = await getTranslations();
  const format = await getFormatter();
  const { id } = await params;
  const { guardado } = await searchParams;

  const { ctx, data } = await withSession(async (queries) => {
    const customer = await queries.customers.byId(id);
    if (!customer) return null;
    const [balance, receivables] = await Promise.all([
      queries.payments.outstandingBalanceFor(id, 'USD'),
      queries.payments.customerReceivables(id),
    ]);
    return { customer, balance, receivables };
  });

  if (!can(ctx.actor, 'customer:read') || data === null) notFound();

  const { customer, balance, receivables } = data;
  const canWrite = can(ctx.actor, 'customer:write');
  const canReceive = can(ctx.actor, 'payment:receive');

  const balanceNum = Number(balance.replace(',', '.'));
  const limitNum = customer.creditLimit ? Number(customer.creditLimit.replace(',', '.')) : null;
  const isOverLimit = limitNum !== null && balanceNum > limitNum;

  return (
    <Screen
      title={customer.name}
      subtitle={customer.code}
      back={{ href: '/customers', label: t('customers.title') }}
      {...(guardado !== undefined ? { toast: t('common.saved') } : {})}
      action={
        <>
          <StatusBadge
            archived={customer.archived}
            activeLabel={t('status.active')}
            archivedLabel={t('status.archived')}
          />
          {canReceive && receivables.length > 0 && (
            <Link
              href={`/payments/new?customerId=${customer.id}`}
              className={buttonClasses({ variant: 'primary', size: 'sm' })}
            >
              <Banknote aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {t('payments.registerPayment')}
            </Link>
          )}
          {canWrite && (
            <Link
              href={`/customers/${customer.id}/edit`}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {t('common.edit')}
            </Link>
          )}
          {canWrite && (
            <StatusToggle
              action={setCustomerStatusAction}
              idField="customerId"
              id={customer.id}
              archived={customer.archived}
              archiveLabel={t('customers.archive')}
              restoreLabel={t('customers.restore')}
            />
          )}
        </>
      }
    >
      {customer.archived && (
        <Alert tone="warn" role="status" className="mb-6">
          {t('customers.archivedNotice')}
        </Alert>
      )}

      {isOverLimit && (
        <Alert tone="danger" role="alert" className="mb-6">
          {t('payments.creditLimitExceededNotice', {
            limit: customer.creditLimit ?? '',
            balance,
          })}
        </Alert>
      )}

      <div className="max-w-4xl space-y-8">
        <DetailList
          rows={[
            { label: t('customers.code'), value: customer.code, mono: true },
            { label: t('customers.name'), value: customer.name },
            { label: t('customers.taxId'), value: customer.taxId },
            { label: t('customers.email'), value: customer.email },
            { label: t('customers.phone'), value: customer.phone },
            { label: t('customers.address'), value: customer.address },
            {
              label: t('customers.creditLimit'),
              value:
                customer.creditLimit === null
                  ? t('customers.noCreditLimit')
                  : `$ ${customer.creditLimit}`,
            },
            {
              label: t('customers.outstandingBalance'),
              value: `$ ${balance}`,
            },
          ]}
          emptyLabel={t('common.notSet')}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">{t('payments.receivablesTitle')}</h2>
            {canReceive && receivables.length > 0 && (
              <Link
                href={`/payments/new?customerId=${customer.id}`}
                className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              >
                {t('payments.payFull')}
              </Link>
            )}
          </div>

          {receivables.length === 0 ? (
            <Card className="p-5 text-center text-sm text-muted">
              {t('payments.noPendingBalance')}
            </Card>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-line bg-canvas text-xs text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('deliveryNotes.number')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('deliveryNotes.issuedAt')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('deliveryNotes.total')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('payments.alreadyPaid')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('payments.balance')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((rec) => (
                  <tr key={rec.deliveryNoteId} className="border-b border-line">
                    <td className="px-4 py-3">
                      <Link
                        href={`/delivery-notes/${rec.deliveryNoteId}`}
                        className="font-mono text-sm font-medium text-brand underline-offset-2 hover:underline"
                      >
                        {rec.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {rec.issuedAt ? format.dateTime(rec.issuedAt, { dateStyle: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">$ {rec.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      $ {rec.paidAmount}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                      $ {rec.balance}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canReceive && (
                        <Link
                          href={`/payments/new?customerId=${customer.id}`}
                          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                        >
                          {t('payments.pay')}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </div>
      </div>
    </Screen>
  );
}
