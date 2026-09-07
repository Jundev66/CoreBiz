import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { Shell } from '@/ui/shell';
import { DeliveryNoteForm } from '@/ui/delivery-note-form';

export default async function NewDeliveryNotePage() {
  const t = await getTranslations();
  const { ctx, queries } = await forRequest();

  const [customers, products] = await Promise.all([
    queries.customers.options(),
    queries.products.options(),
  ]);

  // Se pasan datos PLANOS al componente de cliente, no agregados: un value object no
  // sobrevive a la serializacion entre servidor y navegador.
  return (
    <Shell
      ctx={ctx}
      title={t('deliveryNotes.new')}
      action={
        <Link href="/delivery-notes" className="text-sm text-[var(--color-muted)] hover:underline">
          ← {t('deliveryNotes.title')}
        </Link>
      }
    >
      <DeliveryNoteForm
        taxRateBp={ctx.settings.taxRateBp}
        customers={customers.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
        products={products.map((p) => ({
          id: p.id,
          label: `${p.sku} · ${p.name}`,
          price: p.price,
          unit: p.unit,
          stock: p.stock,
        }))}
      />
    </Shell>
  );
}
