import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { Shell, TableFrame } from '@/ui/shell';
import { BackLink } from '@/ui/primitives';
import { DetailList } from '@/ui/detail';
import { VoidReceiptForm } from '@/ui/void-receipt-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('purchases.detail') };
}

/**
 * Detalle de una recepcion de mercancia.
 *
 * Existe porque sin ella el modulo estaba cojo de una forma poco visible: se podia
 * registrar una entrada y no volver a verla nunca. El listado dice cuanto y de
 * quien; para saber QUE llego —y a que coste, que es lo que decide el margen— hacia
 * falta esta pantalla.
 *
 * La descripcion y la unidad de cada linea van congeladas en el documento. Si
 * manana se renombra "Harina 1 kg", la recepcion de marzo sigue diciendo lo que se
 * recibio en marzo, que es para lo que sirve un documento.
 */
export default async function GoodsReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations();
  const format = await getFormatter();
  const { id } = await params;
  const { ctx, session, queries } = await apiForRequest();

  const receipt = await queries.purchasing.receiptById(id);

  // 404 y no 403: un 403 confirmaria que el documento existe en otra empresa.
  if (receipt === null) notFound();

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={receipt.number}
      subtitle={receipt.supplierName}
      action={<BackLink href="/purchases">{t('purchases.title')}</BackLink>}
    >
      {receipt.status === 'voided' && (
        <p
          role="status"
          className="mb-6 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger-ink)]"
        >
          {t('purchases.voidedNotice', { reason: receipt.voidReason ?? '—' })}
        </p>
      )}

      <DetailList
        rows={[
          { label: t('purchases.number'), value: receipt.number, mono: true },
          {
            label: t('purchases.supplier'),
            value: `${receipt.supplierCode} · ${receipt.supplierName}`,
          },
          {
            label: t('purchases.received'),
            value:
              receipt.receivedAt === null
                ? null
                : format.dateTime(receipt.receivedAt, { dateStyle: 'medium', timeStyle: 'short' }),
          },
          { label: t('purchases.supplierReference'), value: receipt.supplierReference },
          { label: t('purchases.notes'), value: receipt.notes },
          { label: t('purchases.total'), value: `$ ${receipt.total}` },
        ]}
        emptyLabel={t('common.notSet')}
      />

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-medium">{t('purchases.lines')}</h2>

        <TableFrame>
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
              <th scope="col" className="px-4 py-3 font-medium">
                {t('purchases.lineDescription')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('purchases.lineQuantity')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('purchases.lineUnitCost')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('purchases.lineTotal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line) => (
              <tr key={line.lineNo} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-4 py-3">{line.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {line.quantity} {line.unit}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">$ {line.unitCost}</td>
                <td className="px-4 py-3 text-right tabular-nums">$ {line.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      </section>

      {/* Anular solo se ofrece si la recepcion sigue viva Y quien mira puede hacerlo. El
          caso de uso lo revalida igualmente: esto no es la seguridad, es no ensenar un
          boton que va a decir que no. */}
      {receipt.status !== 'voided' && can(ctx.actor, 'purchase:void') && (
        <VoidReceiptForm goodsReceiptId={receipt.id} number={receipt.number} />
      )}
    </Shell>
  );
}
