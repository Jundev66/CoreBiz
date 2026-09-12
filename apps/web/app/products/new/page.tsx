import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell } from '@/ui/shell';
import { BackLink } from '@/ui/primitives';
import { ProductForm } from '@/ui/product-form';
import { notFound } from 'next/navigation';
import { can } from '@corebiz/domain';

export default async function NewProductPage() {
  const t = await getTranslations();
  const { ctx, session } = await apiForRequest();

  if (!can(ctx.actor, 'product:write')) notFound();

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('products.new')}
      action={<BackLink href="/products">{t('products.title')}</BackLink>}
    >
      <div className="max-w-2xl">
        <ProductForm />
      </div>
    </Shell>
  );
}
