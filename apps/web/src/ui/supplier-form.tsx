'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  createSupplierAction,
  updateSupplierAction,
  type PurchasingState,
} from '@/actions/purchasing';
import { Field } from '@/ui/field';

const INITIAL: PurchasingState = { status: 'idle' };

/**
 * Formulario de proveedor: alta y correccion.
 *
 * Un campo obligatorio y cinco opcionales. Los opcionales van marcados como tales y no
 * al reves: un formulario donde todo parece obligatorio hace que la gente invente datos
 * para poder guardar.
 *
 * Gana `notes`, que el contrato y la API aceptaban desde el principio y ninguna pantalla
 * pedia — el campo llegaba hasta la base de datos y no habia forma de rellenarlo.
 */
export interface SupplierFormValues {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly taxId: string | null;
  readonly notes: string | null;
}

export function SupplierForm({ supplier }: { supplier?: SupplierFormValues }) {
  const t = useTranslations();
  const editing = supplier !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updateSupplierAction : createSupplierAction,
    INITIAL,
  );

  const valor = (v: string | null | undefined) => v ?? '';
  const fieldError = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-4">
      {editing && <input type="hidden" name="supplierId" value={supplier.id} />}

      {/* El codigo lo genera el sistema al guardar (`PRV26000001`). Al corregir ya
          existe, asi que se enseña — como texto, porque no es un campo. */}
      {editing && (
        <p className="text-sm text-[var(--color-muted)]">
          {t('suppliers.code')}:{' '}
          <span className="font-mono text-[var(--color-ink)]">{supplier.code}</span>
        </p>
      )}

      <Field
        name="name"
        label={t('suppliers.name')}
        required
        autoComplete="organization"
        defaultValue={valor(supplier?.name)}
        error={fieldError('name')}
      />
      {/* Aqui solo el nombre es obligatorio, asi que lo que se señala es lo contrario:
          marcar cinco campos como opcionales dice mas que marcar uno como exigido. */}
      <Field
        name="contactName"
        label={t('suppliers.contact')}
        optional
        defaultValue={valor(supplier?.contactName)}
        error={fieldError('contactName')}
      />
      <Field
        name="phone"
        label={t('suppliers.phone')}
        type="tel"
        optional
        defaultValue={valor(supplier?.phone)}
        error={fieldError('phone')}
      />
      <Field
        name="email"
        label={t('suppliers.email')}
        type="email"
        optional
        defaultValue={valor(supplier?.email)}
        error={fieldError('email')}
      />
      <Field
        name="taxId"
        label={t('suppliers.taxId')}
        optional
        defaultValue={valor(supplier?.taxId)}
        error={fieldError('taxId')}
      />
      <Field
        name="notes"
        label={t('suppliers.notes')}
        optional
        defaultValue={valor(supplier?.notes)}
        error={fieldError('notes')}
      />

      {/* The general notice only when there are NO field errors: with both, the same thing
          is said twice, and the general one does not point at where. */}
      {state.status === 'error' && state.errorKind !== undefined && !state.fieldErrors && (
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
