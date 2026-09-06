import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { asId, type DeliveryNoteId } from '@corebiz/domain';
import { forRequest } from '@/composition/container';
import { memoryQueries } from '@/composition/memory-driver';
import { Shell, TableFrame } from '@/ui/shell';

/**
 * Detalle de una nota de entrega.
 *
 * Es la vista que se imprime, y por tanto donde el aviso de documento no fiscal y la
 * tasa congelada tienen que verse sin ambiguedad.
 */
export default async function DeliveryNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx } = await forRequest();

  const queries = memoryQueries(ctx.tenantId);
  const note = await queries.deliveryNotes.findById(asId<DeliveryNoteId>(id));

  // 404 y no 403: un 403 confirmaria que el documento existe en otra empresa.
  if (!note) notFound();

  const customer = await queries.customers.findById(note.customerId);

  return (
    <Shell
      ctx={ctx}
      title={note.number}
      subtitle={customer?.name ?? t('deliveryNotes.customer')}
      action={
        <Link href="/delivery-notes" className="text-sm text-[var(--color-muted)] hover:underline">
          ← {t('deliveryNotes.title')}
        </Link>
      }
    >
      <dl className="mb-8 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            {t('deliveryNotes.status')}
          </dt>
          <dd className="mt-1 font-medium">{t(`deliveryNotes.statuses.${note.status}`)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            {t('deliveryNotes.issuedAt')}
          </dt>
          <dd className="mt-1 font-medium">
            {note.issuedAt ? format.dateTime(note.issuedAt, { dateStyle: 'long' }) : '—'}
          </dd>
        </div>
        <div>
          {/* La tasa se muestra CON su fecha de captura. Sin la fecha, el dato invita a
              pensar que es la tasa de hoy, que es justo lo que no es. */}
          <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            {t('deliveryNotes.exchangeRate')}
          </dt>
          <dd className="mt-1 font-medium tabular-nums">
            {note.exchangeRate.toCompactString()} Bs/USD
            <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
              {format.dateTime(note.exchangeRate.capturedAt, { dateStyle: 'short' })}
            </span>
          </dd>
        </div>
      </dl>

      {note.voidReason && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-4 py-3 text-sm"
        >
          {t('deliveryNotes.voidedWithReason', { reason: note.voidReason })}
        </p>
      )}

      <TableFrame>
        <thead>
          <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
            <th scope="col" className="px-4 py-3 font-medium">
              {t('deliveryNotes.description')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t('deliveryNotes.quantity')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t('deliveryNotes.unitPrice')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t('deliveryNotes.lineTotal')}
            </th>
          </tr>
        </thead>
        <tbody>
          {note.lines.map((line) => (
            <tr key={line.lineNo} className="border-b border-[var(--color-line)]">
              {/* Nombre CONGELADO al emitir: si el producto se renombro despues, el
                  documento sigue diciendo lo que decia el dia que se entrego. */}
              <td className="px-4 py-3">{line.descriptionSnapshot}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {line.quantity.toCompactString()} {line.unitSnapshot}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                $ {line.unitPrice.toString()}
                {line.discountBp > 0 && (
                  <span className="ml-1 text-xs text-[var(--color-muted)]">
                    −{(line.discountBp / 100).toFixed(0)}%
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">$ {line.lineTotal.toString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="px-4 py-2 text-right text-[var(--color-muted)]">
              {t('deliveryNotes.subtotal')}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              $ {note.totals.subtotal.toString()}
            </td>
          </tr>
          <tr>
            <td colSpan={3} className="px-4 py-2 text-right text-[var(--color-muted)]">
              {note.taxLabel}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">$ {note.totals.tax.toString()}</td>
          </tr>
          <tr className="border-t border-[var(--color-line)] font-semibold">
            <td colSpan={3} className="px-4 py-3 text-right">
              {t('deliveryNotes.total')}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">$ {note.totals.total.toString()}</td>
          </tr>
          <tr>
            <td colSpan={3} className="px-4 py-2 text-right text-[var(--color-muted)]">
              {t('deliveryNotes.totalBs')}
            </td>
            <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">
              Bs {note.totals.totalInSecondaryCurrency.toString()}
            </td>
          </tr>
        </tfoot>
      </TableFrame>

      {/* Obligatorio en todo documento. Ver ADR 003. */}
      <p className="mt-8 border-t border-[var(--color-line)] pt-4 text-center text-sm font-medium">
        {t('legal.nonFiscal')}
      </p>
    </Shell>
  );
}
