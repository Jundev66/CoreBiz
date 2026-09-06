import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { memoryQueries } from '@/composition/memory-driver';
import { Shell } from '@/ui/shell';
import { DeliveryNoteForm } from '@/ui/delivery-note-form';

export default async function NewDeliveryNotePage() {
  const t = await getTranslations();
  const { ctx } = await forRequest();

  const queries = memoryQueries(ctx.tenantId);
  const customers = await queries.customers.list({ limit: 500 });
  const products = await queries.products.list({ limit: 500 });

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
        customers={customers.items.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
        products={products.items.map((p) => ({
          id: p.id,
          label: `${p.sku} · ${p.name}`,
          price: p.price.toString(),
          unit: p.unit,
          stock: p.trackStock ? p.onHand.toCompactString() : null,
        }))}
      />
    </Shell>
  );
}
