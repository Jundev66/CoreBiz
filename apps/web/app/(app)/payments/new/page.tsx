import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { can } from '@corebiz/domain';
import { withSession } from '@/api/session';
import { Screen } from '@/ui/shell';
import { PaymentForm } from '@/ui/payment-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('payments.new') };
}

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const t = await getTranslations();
  const { customerId } = await searchParams;

  const { ctx, data } = await withSession(async (queries) => {
    const customerOptions = await queries.customers.options();
    const effectiveCustomerId = customerId ?? customerOptions[0]?.id;
    const receivables = effectiveCustomerId
      ? await queries.payments.customerReceivables(effectiveCustomerId)
      : [];
    return { customerOptions, effectiveCustomerId, receivables };
  });

  if (!can(ctx.actor, 'payment:receive') || data === null) {
    notFound();
  }

  const { customerOptions, effectiveCustomerId, receivables } = data;

  const formattedCustomers = customerOptions.map((c) => ({
    id: c.id,
    label: `${c.code} · ${c.name}`,
  }));

  return (
    <Screen
      title={t('payments.new')}
      subtitle={t('payments.newSubtitle')}
      back={{ href: '/payments', label: t('payments.title') }}
    >
      <PaymentForm
        customers={formattedCustomers}
        {...(effectiveCustomerId ? { selectedCustomerId: effectiveCustomerId } : {})}
        receivables={receivables}
      />
    </Screen>
  );
}
