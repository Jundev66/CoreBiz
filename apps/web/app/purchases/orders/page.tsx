import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell } from '@/ui/shell';
import { UpgradeNotice } from '@/ui/upgrade-notice';
import { InDevelopment } from '@/ui/in-development';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('purchaseOrders.title') };
}

/**
 * Ordenes de compra — en desarrollo.
 *
 * Fue un recorte declarado, no un olvido: para un comercio pequeno lo que mueve el
 * negocio es registrar lo que LLEGO, y pedir formalmente antes es un flujo de
 * empresas con departamento de compras. El ciclo comprar → stock → vender queda
 * cerrado sin esto.
 */
export default async function PurchaseOrdersPage() {
  const t = await getTranslations();
  const { ctx, session } = await apiForRequest();

  if (!ctx.plan.has('purchasing')) {
    return (
      <Shell ctx={ctx} session={session} title={t('purchaseOrders.title')}>
        <UpgradeNotice feature={t('purchases.title')} />
      </Shell>
    );
  }

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('purchaseOrders.title')}
      subtitle={t('purchaseOrders.subtitle')}
    >
      <InDevelopment
        summary={t('purchaseOrders.summary')}
        points={[
          t('purchaseOrders.pointOrder'),
          t('purchaseOrders.pointPartial'),
          t('purchaseOrders.pointPending'),
        ]}
        why={t('purchaseOrders.why')}
        meanwhile={{
          text: t('purchaseOrders.meanwhile'),
          href: '/purchases/new',
          label: t('purchases.new'),
        }}
      />
    </Shell>
  );
}
