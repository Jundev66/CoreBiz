import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { Printer } from 'lucide-react';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { Shell, TableFrame } from '@/ui/shell';
import { buttonClasses } from '@/ui/button';
import { Alert, Badge, type BadgeTone } from '@/ui/feedback';
import { Card } from '@/ui/primitives';
import { MarkDeliveredForm } from '@/ui/mark-delivered-form';
import { VoidNoteForm } from '@/ui/void-note-form';

/** Colour follows meaning: in transit is the accent, done is green, voided is red. */
function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'issued':
      return 'brand';
    case 'delivered':
      return 'success';
    case 'voided':
      return 'danger';
    default:
      return 'neutral';
  }
}

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
  const { ctx, session, queries } = await apiForRequest();

  const note = await queries.deliveryNotes.findById(id);

  // 404 y no 403: un 403 confirmaria que el documento existe en otra empresa.
  if (!note) notFound();

  const canDeliver = note.status === 'issued' && can(ctx.actor, 'delivery_note:deliver');
  const canVoid = note.status !== 'voided' && can(ctx.actor, 'delivery_note:void');

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={note.number}
      subtitle={note.customerName}
      back={{ href: '/delivery-notes', label: t('deliveryNotes.title') }}
      action={
        /* La vista de impresion se sirve sin el marco de la aplicacion: lo
           que se imprime tiene que ser el documento, no una captura de la
           aplicacion con el documento dentro. */
        <Link
          href={`/delivery-notes/${id}/print`}
          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        >
          <Printer aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {t('deliveryNotes.print')}
        </Link>
      }
    >
      <Card className="mb-6">
        <dl className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-3 sm:p-6">
          <div>
            <dt className="text-xs font-medium text-muted">{t('deliveryNotes.status')}</dt>
            <dd className="mt-1.5">
              <Badge tone={statusTone(note.status)}>
                {t(`deliveryNotes.statuses.${note.status}`)}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">{t('deliveryNotes.issuedAt')}</dt>
            <dd className="mt-1 text-[15px] text-ink">
              {note.issuedAt ? format.dateTime(note.issuedAt, { dateStyle: 'long' }) : '—'}
            </dd>
          </div>
          <div>
            {/* La tasa se muestra CON su fecha de captura. Sin la fecha, el dato invita a
                pensar que es la tasa de hoy, que es justo lo que no es. */}
            <dt className="text-xs font-medium text-muted">{t('deliveryNotes.exchangeRate')}</dt>
            <dd className="mt-1 text-[15px] text-ink tabular-nums">
              {note.exchangeRate} Bs/USD
              <span className="ml-2 text-xs text-muted">
                {format.dateTime(note.exchangeRateAt, { dateStyle: 'short' })}
              </span>
            </dd>
          </div>
        </dl>
      </Card>

      {/* Quien recibio, cuando la entrega ya esta confirmada. Es el dato que cierra el
          circulo con la linea de firma del papel, asi que se ve tambien en pantalla. */}
      {note.receivedBy && note.deliveredAt && (
        <Alert tone="success" className="mb-6">
          {t('deliveryNotes.deliveredTo', { name: note.receivedBy })}
          <span className="ml-2 opacity-80">
            {format.dateTime(note.deliveredAt, { dateStyle: 'long' })}
          </span>
        </Alert>
      )}

      {note.voidReason && (
        <Alert tone="danger" role="alert" className="mb-6">
          {t('deliveryNotes.voidedWithReason', { reason: note.voidReason })}
        </Alert>
      )}

      <TableFrame>
        <thead>
          <tr className="border-b border-line bg-canvas text-xs text-muted">
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
            <tr key={line.lineNo} className="border-b border-line">
              {/* Nombre CONGELADO al emitir: si el producto se renombro despues, el
                  documento sigue diciendo lo que decia el dia que se entrego. */}
              <td className="px-4 py-3 text-ink">{line.description}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap text-ink tabular-nums">
                {line.quantity} {line.unit}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap text-ink tabular-nums">
                $ {line.unitPrice}
                {line.discountBp > 0 && (
                  <span className="ml-1 text-xs text-muted">
                    −{(line.discountBp / 100).toFixed(0)}%
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap text-ink tabular-nums">
                $ {line.lineTotal}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="px-4 pt-3 pb-1.5 text-right text-muted">
              {t('deliveryNotes.subtotal')}
            </td>
            <td className="px-4 pt-3 pb-1.5 text-right whitespace-nowrap text-ink tabular-nums">
              $ {note.subtotal}
            </td>
          </tr>
          <tr>
            <td colSpan={3} className="px-4 py-1.5 text-right text-muted">
              {note.taxLabel}
            </td>
            <td className="px-4 py-1.5 text-right whitespace-nowrap text-ink tabular-nums">
              $ {note.tax}
            </td>
          </tr>
          <tr className="border-t border-line text-base font-semibold text-ink">
            <td colSpan={3} className="px-4 py-3 text-right">
              {t('deliveryNotes.total')}
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">$ {note.total}</td>
          </tr>
          <tr>
            <td colSpan={3} className="px-4 pb-3 text-right text-muted">
              {t('deliveryNotes.totalBs')}
            </td>
            <td className="px-4 pb-3 text-right whitespace-nowrap text-muted tabular-nums">
              Bs {note.totalSecondary}
            </td>
          </tr>
        </tfoot>
      </TableFrame>

      {/* Obligatorio en todo documento. Ver ADR 003. */}
      <p className="mt-6 border-t border-line pt-4 text-center text-sm font-medium text-ink-soft">
        {t('legal.nonFiscal')}
      </p>

      {(canDeliver || canVoid) && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
          {/* Confirmar la entrega solo se ofrece mientras la nota siga emitida. Es el unico
              formulario de esta pantalla que ALMACEN puede ver: mover las cajas y confirmar
              que llegaron es su trabajo, emitir y anular no. */}
          {canDeliver && <MarkDeliveredForm deliveryNoteId={id} />}

          {/* Anular solo tiene sentido una vez, y solo con permiso para hacerlo. Ocultar el
              formulario NO es la medida de seguridad —el caso de uso comprueba lo mismo— pero
              ofrecer un boton que va a fallar es una forma tonta de gastarle el tiempo a
              alguien. */}
          {canVoid && <VoidNoteForm deliveryNoteId={id} number={note.number} />}
        </div>
      )}
    </Shell>
  );
}
