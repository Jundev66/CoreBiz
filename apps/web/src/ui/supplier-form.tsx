'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createSupplierAction, type PurchasingState } from '@/actions/purchasing';

const INITIAL: PurchasingState = { status: 'idle' };

/**
 * Alta de proveedor.
 *
 * Dos campos obligatorios y cuatro opcionales. Los opcionales van marcados como
 * tales y no al reves: un formulario donde todo parece obligatorio hace que la
 * gente invente datos para poder guardar.
 */
export function SupplierForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(createSupplierAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      {/* El codigo lo genera el sistema al guardar (`PRV26000001`). */}
      <Field name="name" label={t('suppliers.name')} required autoComplete="organization" />
      <Field name="contactName" label={t('suppliers.contact')} />
      <Field name="phone" label={t('suppliers.phone')} type="tel" />
      <Field name="email" label={t('suppliers.email')} type="email" />
      <Field name="taxId" label={t('suppliers.taxId')} />

      {state.status === 'error' && state.errorKind !== undefined && (
        <p
          role="alert"
          className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger-ink)]"
        >
          {t(`purchases.errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-[var(--color-brand-ink)] disabled:opacity-60"
      >
        {pending ? '…' : t('common.save')}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  type = 'text',
  required,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const t = useTranslations();
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required !== true && (
          <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">
            {t('common.optional')}
          </span>
        )}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-base"
      />
    </div>
  );
}
