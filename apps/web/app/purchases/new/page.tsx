import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { Shell } from '@/ui/shell';
import { UpgradeNotice } from '@/ui/upgrade-notice';
import { GoodsReceiptForm } from '@/ui/goods-receipt-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('purchases.new') };
}

/**
 * Registrar la entrada de mercancia.
 *
 * Es el reverso de emitir una nota de entrega, y la pantalla lo refleja: mismo
 * formulario de lineas, misma forma de anadir y quitar renglones. Alguien que ya
 * sabe despachar sabe recibir sin que nadie se lo explique.
 */
export default async function NewGoodsReceiptPage() {
  const t = await getTranslations();
  const { ctx, session, queries } = await forRequest();

  if (!ctx.plan.has('purchasing')) {
    return (
      <Shell
        ctx={ctx}
        session={session}
        title={t('purchases.new')}
        subtitle={t('purchases.subtitle')}
      >
        <UpgradeNotice feature={t('purchases.title')} />
      </Shell>
    );
  }

  const [suppliers, products] = await Promise.all([
    queries.purchasing.supplierOptions(),
    queries.products.options(),
  ]);

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('purchases.new')}
      subtitle={t('purchases.newSubtitle')}
    >
      <GoodsReceiptForm
        suppliers={suppliers.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))}
        products={products
          // Un servicio no se puede recibir: no tiene existencias. Se filtra
          // aqui para no ofrecer una opcion que el dominio va a rechazar.
          .filter((p) => p.stock !== null)
          .map((p) => ({ id: p.id, label: `${p.sku} · ${p.name}`, unit: p.unit }))}
      />
    </Shell>
  );
}
