'use client';

import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { updateTenantSettingsAction, type AdminState } from '@/actions/administration';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { Field } from '@/ui/field';
import { toast } from '@/ui/toast';

const INITIAL: AdminState = { status: 'idle' };

export interface TenantSettingsDefaults {
  readonly taxLabel: string;
  readonly taxRatePercent: string;
  readonly baseCurrency: 'USD' | 'VES';
  readonly exchangeRate: string;
}

export function TenantSettingsForm({
  canWrite,
  defaults,
}: {
  canWrite: boolean;
  defaults: TenantSettingsDefaults;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(updateTenantSettingsAction, INITIAL);

  useEffect(() => {
    if (state.status === 'error' && state.errorKind) {
      toast.error(t(`settings.errors.${state.errorKind}`, state.errorParams ?? {}));
    } else if (state.status === 'success') {
      toast.success(t('settings.saved'));
    }
  }, [state, t]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const rateInput = form.elements.namedItem('exchangeRate') as HTMLInputElement | null;
    const taxInput = form.elements.namedItem('taxRatePercent') as HTMLInputElement | null;

    if (rateInput && rateInput.value.trim() !== '') {
      const r = Number(rateInput.value.trim().replace(',', '.'));
      if (isNaN(r) || r <= 0) {
        e.preventDefault();
        toast.error('La tasa de cambio oficial debe ser un número positivo mayor a cero.', {
          title: 'Tasa inválida',
        });
        rateInput.focus();
        return;
      }
    }

    if (taxInput && taxInput.value.trim() !== '') {
      const tVal = Number(taxInput.value.trim().replace(',', '.'));
      if (isNaN(tVal) || tVal < 0 || tVal > 100) {
        e.preventDefault();
        toast.error('El porcentaje de impuesto debe ser un valor entre 0 y 100.', {
          title: 'Impuesto inválido',
        });
        taxInput.focus();
        return;
      }
    }
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-6">
      {/* Said first, before the greyed-out fields, so nobody tries to type into them. */}
      {!canWrite && <Alert tone="info">{t('settings.readOnlyNotice')}</Alert>}

      <fieldset disabled={!canWrite || pending} className="space-y-6">
        <legend className="sr-only">{t('settings.business.heading')}</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            name="taxLabel"
            label={t('settings.fields.taxLabel')}
            hint={t('settings.hints.taxLabel')}
            defaultValue={defaults.taxLabel}
          />

          <Field
            name="taxRatePercent"
            label={t('settings.fields.taxRate')}
            hint={t('settings.hints.taxRate')}
            defaultValue={defaults.taxRatePercent}
            inputMode="decimal"
          />

          <Field
            name="baseCurrency"
            label={t('settings.fields.baseCurrency')}
            hint={t('settings.hints.baseCurrency')}
            defaultValue={defaults.baseCurrency}
            options={[
              { value: 'USD', label: 'USD' },
              { value: 'VES', label: 'VES' },
            ]}
          />

          <Field
            name="exchangeRate"
            label={t('settings.fields.exchangeRate')}
            hint={t('settings.hints.exchangeRate')}
            defaultValue={defaults.exchangeRate}
            inputMode="decimal"
          />
        </div>

        {state.status === 'error' && state.errorKind !== undefined && (
          <Alert tone="danger" role="alert">
            {t(`settings.errors.${state.errorKind}`, state.errorParams ?? {})}
          </Alert>
        )}

        {state.status === 'success' && (
          <Alert tone="success" role="status">
            {t('settings.saved')}
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <button type="submit" className={buttonClasses()}>
            {pending ? '…' : t('common.save')}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
