import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { listTaxRateConfigs } from '@/api/fiscal';
import { Screen } from '@/ui/shell';
import { GoodsReceiptForm } from '@/ui/goods-receipt-form';
import { notFound } from 'next/navigation';
import { can } from '@corebiz/domain';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('purchases.new') };
}

export default async function NewGoodsReceiptPage() {
  const t = await getTranslations();
  const { ctx, queries } = await apiForRequest();

  if (!can(ctx.actor, 'purchase:receive')) notFound();

  const [suppliers, products, taxRates] = await Promise.all([
    queries.purchasing.supplierOptions(),
    queries.products.options(),
    listTaxRateConfigs().catch(() => []),
  ]);

  const defaultTax = taxRates.find((r) => r.isDefault) ?? taxRates[0];
  const defaultTaxPercentage = defaultTax ? defaultTax.rateBp / 100 : ctx.settings.taxRateBp / 100;

  return (
    <Screen
      title={t('purchases.new')}
      subtitle={t('purchases.newSubtitle')}
      back={{ href: '/purchases', label: t('purchases.title') }}
    >
      <GoodsReceiptForm
        suppliers={suppliers.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))}
        products={products
          .filter((p) => p.stock !== null)
          .map((p) => ({
            id: p.id,
            label: `${p.sku} · ${p.name}`,
            unit: p.unit,
            cost: p.cost ?? null,
          }))}
        defaultCurrency={ctx.settings.baseCurrency}
        fiscalCountry={ctx.settings.fiscalCountry ?? 'VE'}
        defaultTaxPercentage={defaultTaxPercentage}
      />
    </Screen>
  );
}
