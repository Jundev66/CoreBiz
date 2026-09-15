'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { updateTenantSettingsAction, type AdminState } from '@/actions/administration';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { Field } from '@/ui/field';

const INITIAL: AdminState = { status: 'idle' };

export interface TenantSettingsDefaults {
  readonly taxLabel: string;
  readonly taxRatePercent: string;
  readonly baseCurrency: 'USD' | 'VES';
  readonly exchangeRate: string;
}

/**
 * Ajustes de la empresa.
 *
 * Cuatro campos, y tres de ellos con consecuencias que la pantalla explica en
 * una linea debajo. No es relleno: la tasa de cambio es el ajuste que mas se
 * malinterpreta de todo el sistema —mucha gente espera que cambiarla actualice
 * los documentos anteriores— y decirlo aqui evita una llamada de soporte que
 * empieza con "se me han descuadrado las notas de marzo".
 *
 * `canWrite` deshabilita los campos para quien no puede cambiarlos, pero el que
 * de verdad decide es el caso de uso. Esto es cortesia visual, no un permiso.
 */
export function TenantSettingsForm({
  canWrite,
  defaults,
}: {
  canWrite: boolean;
  defaults: TenantSettingsDefaults;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(updateTenantSettingsAction, INITIAL);

  return (
    <form action={formAction} className="space-y-6">
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
