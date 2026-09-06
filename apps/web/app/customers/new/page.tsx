import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CustomerForm } from '@/ui/customer-form';

export default async function NewCustomerPage() {
  const t = await getTranslations();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/customers" className="text-sm text-[var(--color-muted)] hover:underline">
        ← {t('customers.title')}
      </Link>
      <h1 className="mt-2 mb-8 text-3xl font-semibold tracking-tight">{t('customers.new')}</h1>
      <CustomerForm />
    </main>
  );
}
