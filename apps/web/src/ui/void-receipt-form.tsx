'use client';

import { useActionState } from 'react';
import { Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { voidGoodsReceiptAction, type PurchasingState } from '@/actions/purchasing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';

/**
 * Anular una recepcion de mercancia ya registrada.
 *
 * Simetrico al de anular una nota de entrega, con una diferencia que el formulario avisa
 * ANTES de que alguien pulse: esto puede fallar. Anular una venta siempre se puede
 * —devolver al inventario lo que salio no tiene impedimento—, pero anular una compra QUITA
 * lo que entro, y si esa mercancia ya se vendio el saldo no da. No se puede dar por no
 * llegado algo que ya salio por la puerta.
 *
 * El motivo es OBLIGATORIO, y no por formalismo: es la unica explicacion de por que una
 * entrada que existe dejo de contar. Sin el, dentro de seis meses nadie sabra si aquella
 * recepcion se anulo porque la mercancia llego danada o porque se tecleo dos veces.
 */

const INITIAL: PurchasingState = { status: 'idle' };

interface VoidReceiptFormProps {
  readonly goodsReceiptId: string;
  readonly number: string;
}

export function VoidReceiptForm({ goodsReceiptId, number }: VoidReceiptFormProps) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(voidGoodsReceiptAction, INITIAL);

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
          <h2 className="text-base font-semibold text-ink">{t('purchases.voidTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('purchases.voidExplain', { number })}</p>
        </div>
      </div>

      <Alert tone="warn" className="mt-4">
        {t('purchases.voidSoldWarning')}
      </Alert>

      <input type="hidden" name="goodsReceiptId" value={goodsReceiptId} />

      <label className="mt-5 block">
        <span className={LABEL_CLASSES}>{t('purchases.voidReason')}</span>
        <input
          name="reason"
          required
          maxLength={200}
          placeholder={t('purchases.voidReasonHint')}
          autoComplete="off"
          className={`mt-1.5 ${CONTROL_CLASSES}`}
        />
      </label>

      {state.status === 'error' && state.errorKind && (
        <Alert tone="danger" role="alert" className="mt-4">
          {t(`purchases.errors.${state.errorKind}`, state.errorParams ?? {})}
        </Alert>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="submit" disabled={pending} className={buttonClasses({ variant: 'danger' })}>
          {pending ? t('common.saving') : t('purchases.voidSubmit')}
        </button>
      </div>
    </form>
  );
}
