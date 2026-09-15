'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { adjustStockAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';
import { buttonClasses } from '@/ui/button';
import { Alert, Badge } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';

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
      className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{t('products.adjustTitle')}</h2>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono text-xs">{sku}</span> · {name}
          </p>
        </div>
        <Badge tone="brand">{t('products.currentStock', { onHand, unit })}</Badge>
      </div>

      <input type="hidden" name="productId" value={productId} />

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL_CLASSES}>{t('products.countedBalance')}</span>
          <input
            name="newBalance"
            required
            // `decimal` y no `numeric`: en un movil saca el teclado con coma, que
            // es lo que se necesita para "12,5 kg".
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            defaultValue={onHand}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
          />
        </label>

        <label className="block">
          <span className={LABEL_CLASSES}>{t('products.adjustReason')}</span>
          <input
            name="reason"
            required
            maxLength={200}
            placeholder={t('products.adjustReasonHint')}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
          />
        </label>
      </div>

      {state.status === 'error' && state.errorKind && (
        <Alert tone="danger" role="alert" className="mt-4">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </Alert>
      )}

      {state.status === 'success' && (
        <Alert tone="success" role="status" className="mt-4">
          {t('products.adjusted', { onHand: state.createdCode ?? '', unit })}
        </Alert>
      )}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <a href="/products" className={buttonClasses({ variant: 'secondary' })}>
          {t('common.cancel')}
        </a>
        <button type="submit" disabled={pending} className={buttonClasses()}>
          {pending ? t('common.saving') : t('products.adjustSubmit')}
        </button>
      </div>
    </form>
  );
}
