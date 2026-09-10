'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { markDeliveredAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';

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
      className="mt-8 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-5"
    >
      <h2 className="text-base font-medium">{t('deliveryNotes.deliverTitle')}</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{t('deliveryNotes.deliverExplain')}</p>

      <input type="hidden" name="deliveryNoteId" value={deliveryNoteId} />

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">{t('deliveryNotes.receivedByField')}</span>
        <input
          name="receivedBy"
          maxLength={120}
          placeholder={t('deliveryNotes.receivedByHint')}
          autoComplete="off"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>

      {state.status === 'error' && state.errorKind && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger-ink)]"
        >
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      <div className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)] disabled:opacity-60"
        >
          {pending ? t('common.saving') : t('deliveryNotes.deliverSubmit')}
        </button>
      </div>
    </form>
  );
}
