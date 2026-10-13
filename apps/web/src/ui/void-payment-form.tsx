'use client';

import { useActionState, useEffect } from 'react';
import { Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { voidPaymentAction, type PaymentActionState } from '@/actions/payments';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { toast } from '@/ui/toast';

const INITIAL: PaymentActionState = { status: 'idle' };

interface VoidPaymentFormProps {
  readonly paymentId: string;
  readonly number: string;
}

export function VoidPaymentForm({ paymentId, number }: VoidPaymentFormProps) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(voidPaymentAction, INITIAL);

  useEffect(() => {
    if (state.status === 'error' && state.errorKind) {
      toast.error(t(`errors.${state.errorKind}`, state.errorParams ?? {}));
    }
  }, [state, t]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const formData = new FormData(e.currentTarget);
    const reason = formData.get('reason');
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      e.preventDefault();
      toast.error(t('payments.voidReasonRequired'), {
        title: t('payments.voidReasonTitle'),
      });
    }
  };

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="rounded-card border border-danger/25 bg-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-danger-soft text-danger-ink">
          <Ban aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{t('payments.voidTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('payments.voidExplain', { number })}</p>
        </div>
      </div>

      <input type="hidden" name="paymentId" value={paymentId} />

      <label className="mt-5 block">
        <span className={LABEL_CLASSES}>{t('payments.voidReason')}</span>
        <input
          name="reason"
          required
          maxLength={200}
          placeholder={t('payments.voidReasonHint')}
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
          {pending ? t('common.saving') : t('payments.voidSubmit')}
        </button>
      </div>
    </form>
  );
}
