import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { assistantStatus } from '@/api/ai';
import { Screen } from '@/ui/shell';
import { ScanPurchaseReceipt } from '@/ui/scan-purchase-receipt';

export default async function ScanPurchaseReceiptPage() {
  const t = await getTranslations();
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'purchase:receive')) notFound();

  const aiStatus = can(ctx.actor, 'assistant:use')
    ? await assistantStatus().catch(() => null)
    : null;

  return (
    <Screen
      title={t('purchases.scanPageTitle')}
      subtitle={t('purchases.scanPageSubtitle')}
      back={{ href: '/purchases', label: t('purchases.title') }}
    >
      <ScanPurchaseReceipt aiStatus={aiStatus} />
    </Screen>
  );
}
