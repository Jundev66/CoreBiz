import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell } from '@/ui/shell';
import { BackLink } from '@/ui/primitives';
import { DeliveryNoteForm } from '@/ui/delivery-note-form';
import { notFound } from 'next/navigation';
import { can } from '@corebiz/domain';

export default async function NewDeliveryNotePage() {
  const t = await getTranslations();
  const { ctx, session, queries } = await apiForRequest();

  // Before reading: the customer list requires `customer:read`, which warehouse lacks, and
  // that 403 broke the issue screen. Whoever can issue can always read customers.
  if (!can(ctx.actor, 'delivery_note:issue')) notFound();

  const [customers, products] = await Promise.all([
    queries.customers.options(),
    queries.products.options(),
  ]);

  /*
   * Sin tasa de cambio no hay documento posible, y hay que decirlo ANTES.
   *
   * Cada nota congela la tasa del dia en que se emite (ADR 002), asi que el dominio se
   * niega a emitir sin ella — con razon: inventarse una tasa seria mentir en un
   * documento que alguien va a guardar. Lo que estaba mal era el momento: una empresa
   * recien creada nace sin tasa, y el aviso solo aparecia DESPUES de elegir cliente,
   * producto y cantidad, sin decir a donde ir. Se rellenaba un formulario que no podia
   * enviarse.
   *
   * Se descubrio dandose de alta como se daria de alta cualquiera. Ningun test lo veia,
   * porque todos entran con la empresa sembrada, que si trae tasa.
   */
  const sinTasa = ctx.settings.exchangeRateScaled === null || ctx.settings.exchangeRateAt === null;

  // Se pasan datos PLANOS al componente de cliente, no agregados: un value object no
  // sobrevive a la serializacion entre servidor y navegador.
  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('deliveryNotes.new')}
      action={<BackLink href="/delivery-notes">{t('deliveryNotes.title')}</BackLink>}
    >
      {sinTasa ? (
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-8 py-12 text-center">
          <p className="text-lg font-medium">{t('deliveryNotes.needsRateTitle')}</p>
          <p className="mx-auto mt-2 max-w-lg text-[var(--color-muted)]">
            {t('deliveryNotes.needsRateDetail')}
          </p>
          <Link
            href="/settings"
            className="mt-8 inline-block rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)]"
          >
            {t('deliveryNotes.needsRateAction')}
          </Link>
        </div>
      ) : (
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
      )}
    </Shell>
  );
}
