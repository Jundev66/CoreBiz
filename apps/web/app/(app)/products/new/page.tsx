import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { ProductForm } from '@/ui/product-form';
import { notFound } from 'next/navigation';
import { can } from '@corebiz/domain';

export default async function NewProductPage() {
  const t = await getTranslations();
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'product:write')) notFound();

  const accounts = await listAccounts().catch(() => []);
  const revenueAccounts = accounts
    .filter((a) => a.category === 'REVENUE')
    .map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }));
  const inventoryAccounts = accounts
    .filter((a) => a.category === 'ASSET')
    .map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }));

  return (
    <Screen title={t('products.new')} back={{ href: '/products', label: t('products.title') }}>
      <Card className="max-w-2xl p-5 sm:p-6">
        <ProductForm revenueAccounts={revenueAccounts} inventoryAccounts={inventoryAccounts} />
      </Card>
    </Screen>
  );
}
