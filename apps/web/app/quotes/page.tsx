import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { Shell } from '@/ui/shell';
import { InDevelopment } from '@/ui/in-development';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('quotes.title') };
}

/**
 * Presupuestos — en desarrollo.
 *
 * El correlativo ya los contempla (`PRE-000001`) y el documento se parece mucho a
 * una nota de entrega: mismas lineas, mismos totales, misma tasa congelada. Lo que
 * cambia es que NO mueve inventario y que tiene una caducidad, y esas dos
 * diferencias son justo las que impiden reutilizar el agregado tal cual.
 */
export default async function QuotesPage() {
  const t = await getTranslations();
  const { ctx, session } = await forRequest();

  return (
    <Shell ctx={ctx} session={session} title={t('quotes.title')} subtitle={t('quotes.subtitle')}>
      <InDevelopment
        summary={t('quotes.summary')}
        points={[t('quotes.pointDraft'), t('quotes.pointNoStock'), t('quotes.pointConvert')]}
        why={t('quotes.why')}
        meanwhile={{
          text: t('quotes.meanwhile'),
          href: '/delivery-notes',
          label: t('nav.deliveryNotes'),
        }}
      />
    </Shell>
  );
}
