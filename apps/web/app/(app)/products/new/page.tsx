import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { ProductForm } from '@/ui/product-form';
import { notFound } from 'next/navigation';
import { can } from '@corebiz/domain';

export default async function NewProductPage() {
  const t = await getTranslations();
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'product:write')) notFound();

  return (
    <Screen title={t('products.new')} back={{ href: '/products', label: t('products.title') }}>
      <Card className="max-w-2xl p-5 sm:p-6">
        <ProductForm />
      </Card>
    </Screen>
  );
}
