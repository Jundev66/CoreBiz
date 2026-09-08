import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell } from '@/ui/shell';
import { ProductForm } from '@/ui/product-form';

export default async function NewProductPage() {
  const t = await getTranslations();
  const { ctx, session } = await apiForRequest();

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('products.new')}
      action={
        <Link href="/products" className="text-sm text-[var(--color-muted)] hover:underline">
          ← {t('products.title')}
        </Link>
      }
    >
      <div className="max-w-2xl">
        <ProductForm />
      </div>
    </Shell>
  );
}
