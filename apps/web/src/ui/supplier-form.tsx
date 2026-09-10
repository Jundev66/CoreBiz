'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createSupplierAction, type PurchasingState } from '@/actions/purchasing';
import { Field } from '@/ui/field';

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
      {/* Aqui solo el nombre es obligatorio, asi que lo que se señala es lo contrario:
          marcar cuatro campos como opcionales dice mas que marcar uno como exigido. */}
      <Field name="contactName" label={t('suppliers.contact')} optional />
      <Field name="phone" label={t('suppliers.phone')} type="tel" optional />
      <Field name="email" label={t('suppliers.email')} type="email" optional />
      <Field name="taxId" label={t('suppliers.taxId')} optional />

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
