import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { readAccountingConfigStatus, readProductTaxMap } from '@/api/accounting-mapping';
import { listTaxRateConfigs } from '@/api/fiscal';
import { Screen } from '@/ui/shell';
import { Alert } from '@/ui/feedback';
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

  const [suppliers, products, taxRates, accounts, productTaxMap] = await Promise.all([
    queries.purchasing.supplierOptions(),
    queries.products.options(),
    listTaxRateConfigs().catch(() => []),
    listAccounts().catch(() => []),
    readProductTaxMap(ctx.tenantId),
  ]);

  const accountingStatus = await readAccountingConfigStatus(ctx.tenantId, accounts, [
    'inventoryAccountId',
    'payableAccountId',
    'cashAccountId',
    'taxCreditAccountId',
  ]);

  const defaultTax = taxRates.find((r) => r.isDefault) ?? taxRates[0];
  const defaultTaxPercentage = defaultTax ? defaultTax.rateBp / 100 : ctx.settings.taxRateBp / 100;
  const defaultExchangeRate = ctx.settings.exchangeRateScaled
    ? Number(ctx.settings.exchangeRateScaled) / 100_000_000
    : 50;

  return (
    <Screen
      title={t('purchases.new')}
      subtitle={t('purchases.newSubtitle')}
      back={{ href: '/purchases', label: t('purchases.title') }}
    >
      {!accountingStatus.isConfigured && (
        <Alert tone="warn" role="alert" className="mb-6">
          Faltan cuentas contables configuradas para registrar compras (
          {accountingStatus.missingRoles.join(', ')}).{' '}
          <Link href="/settings/accounting" className="font-semibold underline">
            Configurar Cuentas Contables
          </Link>
        </Alert>
      )}
      <GoodsReceiptForm
        suppliers={suppliers.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))}
        products={products
          .filter((p) => p.stock !== null)
          .map((p) => ({
            id: p.id,
            label: `${p.sku} · ${p.name}`,
            unit: p.unit,
            cost: p.cost ?? null,
            taxPercentage: productTaxMap[p.id] ?? null,
          }))}
        defaultCurrency={ctx.settings.baseCurrency}
        defaultExchangeRate={defaultExchangeRate}
        fiscalCountry={ctx.settings.fiscalCountry ?? 'VE'}
        defaultTaxPercentage={defaultTaxPercentage}
        accountingConfigured={accountingStatus.isConfigured}
      />
    </Screen>
  );
}
