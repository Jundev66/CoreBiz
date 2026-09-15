'use client';

import { useActionState } from 'react';
import { Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { voidDeliveryNoteAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';

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
      className="rounded-card border border-danger/25 bg-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-danger-soft text-danger-ink">
          <Ban aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{t('deliveryNotes.voidTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('deliveryNotes.voidExplain', { number })}</p>
        </div>
      </div>

      <input type="hidden" name="deliveryNoteId" value={deliveryNoteId} />

      <label className="mt-5 block">
        <span className={LABEL_CLASSES}>{t('deliveryNotes.voidReason')}</span>
        <input
          name="reason"
          required
          maxLength={200}
          placeholder={t('deliveryNotes.voidReasonHint')}
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
        <button type="submit" disabled={pending} className={buttonClasses({ variant: 'danger' })}>
          {pending ? t('common.saving') : t('deliveryNotes.voidSubmit')}
        </button>
      </div>
    </form>
  );
}
