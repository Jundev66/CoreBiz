'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { voidGoodsReceiptAction, type PurchasingState } from '@/actions/purchasing';

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
      className="mt-8 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-5"
    >
      <h2 className="text-base font-medium">{t('purchases.voidTitle')}</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        {t('purchases.voidExplain', { number })}
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{t('purchases.voidSoldWarning')}</p>

      <input type="hidden" name="goodsReceiptId" value={goodsReceiptId} />

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">{t('purchases.voidReason')}</span>
        <input
          name="reason"
          required
          maxLength={200}
          placeholder={t('purchases.voidReasonHint')}
          autoComplete="off"
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>

      {state.status === 'error' && state.errorKind && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger-ink)]"
        >
          {t(`purchases.errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      <div className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--color-danger)] px-4 py-2 text-sm font-medium text-[var(--color-danger-ink)] disabled:opacity-60"
        >
          {pending ? t('common.saving') : t('purchases.voidSubmit')}
        </button>
      </div>
    </form>
  );
}
