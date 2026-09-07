'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { updateTenantSettingsAction, type AdminState } from '@/actions/administration';

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
    <form action={formAction} className="max-w-lg space-y-5">
      <fieldset disabled={!canWrite || pending} className="space-y-5">
        <legend className="sr-only">{t('settings.business.heading')}</legend>

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

        <div>
          <label htmlFor="baseCurrency" className="block text-sm font-medium">
            {t('settings.fields.baseCurrency')}
          </label>
          <select
            id="baseCurrency"
            name="baseCurrency"
            defaultValue={defaults.baseCurrency}
            aria-describedby="baseCurrency-hint"
            className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-base"
          >
            <option value="USD">USD</option>
            <option value="VES">VES</option>
          </select>
          <p id="baseCurrency-hint" className="mt-1.5 text-xs text-[var(--color-muted)]">
            {t('settings.hints.baseCurrency')}
          </p>
        </div>

        <Field
          name="exchangeRate"
          label={t('settings.fields.exchangeRate')}
          hint={t('settings.hints.exchangeRate')}
          defaultValue={defaults.exchangeRate}
          inputMode="decimal"
        />

        {state.status === 'error' && state.errorKind !== undefined && (
          <p
            role="alert"
            className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger-ink)]"
          >
            {t(`settings.errors.${state.errorKind}`, state.errorParams ?? {})}
          </p>
        )}

        {state.status === 'success' && (
          <p role="status" className="rounded-md bg-[var(--color-brand)]/10 px-4 py-3 text-sm">
            {t('settings.saved')}
          </p>
        )}

        <button
          type="submit"
          className="rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-[var(--color-brand-ink)] disabled:opacity-60"
        >
          {pending ? '…' : t('common.save')}
        </button>
      </fieldset>

      {!canWrite && (
        <p className="text-sm text-[var(--color-muted)]">{t('settings.readOnlyNotice')}</p>
      )}
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  defaultValue,
  inputMode,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  inputMode?: 'decimal';
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue}
        inputMode={inputMode}
        aria-describedby={`${name}-hint`}
        className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-base"
      />
      <p id={`${name}-hint`} className="mt-1.5 text-xs text-[var(--color-muted)]">
        {hint}
      </p>
    </div>
  );
}
