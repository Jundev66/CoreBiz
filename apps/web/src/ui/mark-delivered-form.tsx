'use client';

import { useActionState } from 'react';
import { PackageCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { markDeliveredAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';

/**
 * Confirmar que el cliente recibio la mercancia.
 *
 * A diferencia de anular, esto no es una operacion peligrosa ni excepcional: es el
 * final normal de una venta. Por eso el formulario no avisa de nada, no pide
 * confirmacion y el boton no es rojo.
 *
 * Y no toca el inventario. El stock salio cuando la mercancia dejo el almacen, al
 * emitir la nota; aqui solo se anota que llego a su destino.
 *
 * `receivedBy` es OPCIONAL, y esa es la decision del formulario. Una entrega en
 * mostrador puede no tener a nadie que firme, y exigir un nombre solo conseguiria que
 * se teclease uno inventado — que es peor que un hueco, porque un hueco no miente.
 */

const INITIAL: ActionState = { status: 'idle' };

interface MarkDeliveredFormProps {
  readonly deliveryNoteId: string;
}

export function MarkDeliveredForm({ deliveryNoteId }: MarkDeliveredFormProps) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(markDeliveredAction, INITIAL);

  return (
    <form
      action={formAction}
      className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-brand-soft text-brand">
          <PackageCheck aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{t('deliveryNotes.deliverTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('deliveryNotes.deliverExplain')}</p>
        </div>
      </div>

      <input type="hidden" name="deliveryNoteId" value={deliveryNoteId} />

      <label className="mt-5 block">
        <span className={LABEL_CLASSES}>{t('deliveryNotes.receivedByField')}</span>
        <input
          name="receivedBy"
          maxLength={120}
          placeholder={t('deliveryNotes.receivedByHint')}
          autoComplete="off"
          className={`mt-1.5 ${CONTROL_CLASSES}`}
        />
      </label>

      {state.status === 'error' && state.errorKind && (
        <Alert tone="danger" role="alert" className="mt-4">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </Alert>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="submit" disabled={pending} className={buttonClasses()}>
          {pending ? t('common.saving') : t('deliveryNotes.deliverSubmit')}
        </button>
      </div>
    </form>
  );
}
