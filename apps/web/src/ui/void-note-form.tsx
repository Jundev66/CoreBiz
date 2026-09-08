'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { voidDeliveryNoteAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';

/**
 * Anular una nota de entrega ya emitida.
 *
 * Anular NO es borrar, y el formulario tiene que dejarlo claro antes de que alguien
 * pulse: la nota conserva su numero —la numeracion es continua y un hueco es lo primero
 * que mira una inspeccion—, el inventario vuelve, y el documento sigue existiendo con el
 * motivo a la vista.
 *
 * El motivo es OBLIGATORIO, y no por formalismo: es la unica explicacion de por que un
 * documento que existe dejo de valer. Sin el, dentro de seis meses nadie sabra si aquella
 * nota se anulo por un error de cantidad o porque el cliente devolvio la mercancia.
 */

const INITIAL: ActionState = { status: 'idle' };

interface VoidNoteFormProps {
  readonly deliveryNoteId: string;
  readonly number: string;
}

export function VoidNoteForm({ deliveryNoteId, number }: VoidNoteFormProps) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(voidDeliveryNoteAction, INITIAL);

  return (
    <form
      action={formAction}
      className="mt-8 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-5"
    >
      <h2 className="text-base font-medium">{t('deliveryNotes.voidTitle')}</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        {t('deliveryNotes.voidExplain', { number })}
      </p>

      <input type="hidden" name="deliveryNoteId" value={deliveryNoteId} />

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">{t('deliveryNotes.voidReason')}</span>
        <input
          name="reason"
          required
          maxLength={200}
          placeholder={t('deliveryNotes.voidReasonHint')}
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
          className="rounded-md border border-[var(--color-danger)] px-4 py-2 text-sm font-medium text-[var(--color-danger-ink)] disabled:opacity-60"
        >
          {pending ? t('common.saving') : t('deliveryNotes.voidSubmit')}
        </button>
      </div>
    </form>
  );
}
