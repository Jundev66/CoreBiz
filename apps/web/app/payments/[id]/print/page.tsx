import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { apiForRequest } from '@/api/session';
import { PrintButton } from '@/ui/print-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: id, robots: { index: false, follow: false } };
}

export default async function PrintPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx, queries } = await apiForRequest();

  const payment = await queries.payments.byId(id);
  if (!payment) notFound();

  return (
    <main className="mx-auto max-w-[21cm] bg-white p-8 text-black print:p-0">
      <div className="mb-8 flex items-center justify-between gap-4 print:hidden">
        <a
          href={`/payments/${id}`}
          className="inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {t('common.back')}
        </a>
        <PrintButton label={t('payments.print')} hint={t('payments.printHint')} />
      </div>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-6 border-b border-neutral-300 pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{ctx.tenantSlug}</h1>
          <p className="mt-1 text-sm text-neutral-600">{t('legal.paymentReceiptKind')}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl font-semibold">{payment.number}</p>
          <p className="mt-1 text-sm text-neutral-600">
            {format.dateTime(payment.paidAt, { dateStyle: 'long' })}
          </p>
        </div>
      </header>

      <section className="mb-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t('payments.customer')}
          </h2>
          <p className="mt-1 text-lg font-medium">{payment.customerName}</p>
        </div>
        <div className="sm:text-right">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t('payments.method')}
          </h2>
          <p className="mt-1 text-base font-medium">
            {t(`payments.methods.${payment.paymentMethod}`)}
          </p>
          {payment.reference && (
            <p className="text-sm text-neutral-600">Ref: {payment.reference}</p>
          )}
        </div>
      </section>

      {payment.notes && (
        <section className="mb-8 rounded border border-neutral-200 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t('payments.notes')}
          </h3>
          <p className="mt-1 text-sm text-neutral-700">{payment.notes}</p>
        </section>
      )}

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <th className="py-2.5 pr-4">{t('deliveryNotes.number')}</th>
            <th className="py-2.5 pl-4 text-right">{t('payments.allocatedAmount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {payment.allocations.map((alloc) => (
            <tr key={alloc.deliveryNoteId}>
              <td className="py-3 pr-4 font-mono">{alloc.deliveryNoteNumber}</td>
              <td className="py-3 pl-4 text-right tabular-nums">$ {alloc.amount}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-800 text-base font-semibold">
            <td className="py-3 pr-4 text-right">{t('payments.totalPaid')}</td>
            <td className="py-3 pl-4 text-right tabular-nums">$ {payment.amount}</td>
          </tr>
        </tfoot>
      </table>

      {payment.status === 'voided' && (
        <p className="mt-8 border border-neutral-400 p-3 text-sm font-medium">
          {t('payments.statuses.voided')}: {payment.voidReason}
        </p>
      )}

      <section className="mt-16 grid gap-12 sm:grid-cols-2">
        <SignatureLine label={t('payments.receivedBy')} />
        <SignatureLine label={t('payments.paidBy')} />
      </section>

      <footer className="mt-12 border-t border-neutral-300 pt-4">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-neutral-600">
          {t('legal.notice')}
        </p>
      </footer>
    </main>
  );
}

function SignatureLine({ label, name }: { label: string; name?: string | null }) {
  return (
    <div>
      <div className="flex h-12 items-end border-b border-neutral-400">
        {name ? <span className="pb-1 text-sm">{name}</span> : null}
      </div>
      <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">{label}</p>
    </div>
  );
}
