import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { assistantStatus } from '@/api/ai';
import { Screen } from '@/ui/shell';
import { ScanPurchaseReceipt } from '@/ui/scan-purchase-receipt';

export default async function ScanPurchaseReceiptPage() {
  const t = await getTranslations();
  const { ctx, queries } = await apiForRequest();

  if (!can(ctx.actor, 'purchase:receive')) notFound();

  const [aiStatus, suppliers, products] = await Promise.all([
    can(ctx.actor, 'assistant:use') ? assistantStatus().catch(() => null) : null,
    queries.purchasing.supplierOptions(),
    queries.products.options(),
  ]);

  return (
    <Screen
      title={t('purchases.scanPageTitle')}
      subtitle={t('purchases.scanPageSubtitle')}
      back={{ href: '/purchases', label: t('purchases.title') }}
    >
      <ScanPurchaseReceipt
        aiStatus={aiStatus}
        suppliers={suppliers.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
        products={products
          .filter((p) => p.stock !== null)
          .map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            unit: p.unit,
            cost: p.cost ?? null,
          }))}
      />
    </Screen>
  );
}
