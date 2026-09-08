'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { adjustStockAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';

/**
 * Cuadrar el inventario de un producto tras contarlo.
 *
 * Se pide el SALDO NUEVO y no la diferencia. Quien esta delante del estante ha
 * contado doce; pedirle "-3" es pedirle una resta que puede fallar, y el fallo
 * entraria como si fuera un conteo. El delta lo calcula el dominio, que ya sabe
 * cuanto habia.
 *
 * El saldo actual se muestra al lado, para que el ajuste se haga mirando los dos
 * numeros y no de memoria.
 */

const INITIAL: ActionState = { status: 'idle' };

interface StockAdjustFormProps {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly onHand: string;
  readonly unit: string;
}

export function StockAdjustForm({ productId, sku, name, onHand, unit }: StockAdjustFormProps) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(adjustStockAction, INITIAL);

  return (
    <form
      action={formAction}
      className="mb-6 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-5"
    >
      <h2 className="text-base font-medium">{t('products.adjustTitle')}</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        <span className="font-mono text-xs">{sku}</span> · {name} ·{' '}
        {t('products.currentStock', { onHand, unit })}
      </p>

      <input type="hidden" name="productId" value={productId} />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t('products.countedBalance')}</span>
          <input
            name="newBalance"
            required
            // `decimal` y no `numeric`: en un movil saca el teclado con coma, que
            // es lo que se necesita para "12,5 kg".
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            defaultValue={onHand}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t('products.adjustReason')}</span>
          <input
            name="reason"
            required
            maxLength={200}
            placeholder={t('products.adjustReasonHint')}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
          />
        </label>
      </div>

      {state.status === 'error' && state.errorKind && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger-ink)]"
        >
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      {state.status === 'success' && (
        <p role="status" className="mt-4 rounded-md bg-[var(--color-brand)]/10 px-4 py-3 text-sm">
          {t('products.adjusted', { onHand: state.createdCode ?? '', unit })}
        </p>
      )}

      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)] disabled:opacity-60"
        >
          {pending ? t('common.saving') : t('products.adjustSubmit')}
        </button>
        <a href="/products" className="text-sm underline underline-offset-4">
          {t('common.cancel')}
        </a>
      </div>
    </form>
  );
}
