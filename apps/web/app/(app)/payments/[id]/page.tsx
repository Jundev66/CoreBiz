import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { Printer } from 'lucide-react';
import { can } from '@corebiz/domain';
import { withSession } from '@/api/session';
import { Screen, TableFrame } from '@/ui/shell';
import { buttonClasses } from '@/ui/button';
import { Alert, Badge, type BadgeTone } from '@/ui/feedback';
import { Card } from '@/ui/primitives';
import { VoidPaymentForm } from '@/ui/void-payment-form';

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'applied':
      return 'success';
    case 'voided':
      return 'danger';
    default:
      return 'neutral';
  }
}

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx, data: payment } = await withSession((queries) => queries.payments.byId(id));

  if (!payment) notFound();

  const canVoid = payment.status === 'applied' && can(ctx.actor, 'payment:void');

  return (
    <Screen
      title={payment.number}
      subtitle={payment.customerName}
      back={{ href: '/payments', label: t('payments.title') }}
      action={
        <Link
          href={`/payments/${id}/print`}
          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        >
          <Printer aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {t('payments.print')}
        </Link>
      }
    >
      <Card className="mb-6">
        <dl className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-3 sm:p-6">
          <div>
            <dt className="text-xs font-medium text-muted">{t('payments.status')}</dt>
            <dd className="mt-1.5">
              <Badge tone={statusTone(payment.status)}>
                {t(`payments.statuses.${payment.status}`)}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">{t('payments.paidAt')}</dt>
            <dd className="mt-1 text-[15px] text-ink">
              {format.dateTime(payment.paidAt, { dateStyle: 'long' })}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">{t('payments.method')}</dt>
            <dd className="mt-1 text-[15px] text-ink">
              {t(`payments.methods.${payment.paymentMethod}`)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">{t('payments.customer')}</dt>
            <dd className="mt-1 text-[15px] text-ink">
              <Link
                href={`/customers/${payment.customerId}`}
                className="font-medium text-brand underline-offset-2 hover:underline"
              >
                {payment.customerName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">{t('payments.reference')}</dt>
            <dd className="mt-1 font-mono text-[15px] text-ink">{payment.reference || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">{t('payments.amount')}</dt>
            <dd className="mt-1 text-[15px] font-semibold text-ink tabular-nums">
              $ {payment.amount}
            </dd>
          </div>
        </dl>
      </Card>

      {payment.notes && (
        <Card className="mb-6 p-5 sm:p-6">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            {t('payments.notes')}
          </h2>
          <p className="mt-2 text-sm text-ink whitespace-pre-wrap">{payment.notes}</p>
        </Card>
      )}

      {payment.voidReason && (
        <Alert tone="danger" role="alert" className="mb-6">
          {t('payments.voidedWithReason', { reason: payment.voidReason })}
          {payment.voidedAt && (
            <span className="ml-2 opacity-80">
              · {format.dateTime(payment.voidedAt, { dateStyle: 'long' })}
            </span>
          )}
        </Alert>
      )}

      <div className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-ink">{t('payments.allocations')}</h2>
        <TableFrame>
          <thead>
            <tr className="border-b border-line bg-canvas text-xs text-muted">
              <th scope="col" className="px-4 py-3 font-medium">
                {t('deliveryNotes.number')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('payments.allocatedAmount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.map((alloc) => (
              <tr key={alloc.deliveryNoteId} className="border-b border-line">
                <td className="px-4 py-3 text-ink">
                  <Link
                    href={`/delivery-notes/${alloc.deliveryNoteId}`}
                    className="font-mono text-sm font-medium text-brand underline-offset-2 hover:underline"
                  >
                    {alloc.deliveryNoteNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-ink tabular-nums">
                  $ {alloc.amount}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line text-base font-semibold text-ink">
              <td className="px-4 py-3 text-right">{t('payments.totalAllocated')}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                $ {payment.amount}
              </td>
            </tr>
          </tfoot>
        </TableFrame>
      </div>

      {canVoid && (
        <div className="mt-8 border-t border-line pt-6">
          <VoidPaymentForm paymentId={payment.id} number={payment.number} />
        </div>
      )}
    </Screen>
  );
}
