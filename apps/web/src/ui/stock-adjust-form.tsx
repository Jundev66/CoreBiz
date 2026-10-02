'use client';

import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { adjustStockAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';
import { buttonClasses, ButtonLink } from '@/ui/button';
import { Alert, Badge } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { toast } from '@/ui/toast';

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

  useEffect(() => {
    if (state.status === 'error') {
      if (state.errorKind) {
        toast.error(t(`errors.${state.errorKind}`, state.errorParams ?? {}));
      }
    } else if (state.status === 'success') {
      toast.success(t('products.adjusted', { onHand: state.createdCode ?? '', unit }));
    }
  }, [state, t, unit]);

  const handleAction = (formData: FormData) => {
    const balance = formData.get('newBalance');
    if (typeof balance !== 'string' || balance.trim() === '') {
      toast.error('Debe indicar el nuevo saldo contado en existencia.', {
        title: 'Conteo requerido',
      });
      return;
    }

    const b = Number(balance.trim().replace(',', '.'));
    if (isNaN(b) || b < 0) {
      toast.warning('La cantidad de inventario debe ser un número mayor o igual a 0.', {
        title: 'Cantidad inválida',
      });
      return;
    }

    const reason = formData.get('reason');
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      toast.error('El motivo del ajuste de inventario es obligatorio (mínimo 3 caracteres).', {
        title: 'Motivo requerido',
      });
      return;
    }

    formAction(formData);
  };

  return (
    <form
      action={handleAction}
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
        <ButtonLink href="/products" variant="secondary">
          {t('common.cancel')}
        </ButtonLink>
        <button type="submit" disabled={pending} className={buttonClasses()}>
          {pending ? t('common.saving') : t('products.adjustSubmit')}
        </button>
      </div>
    </form>
  );
}
