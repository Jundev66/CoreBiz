'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  createSupplierAction,
  updateSupplierAction,
  type PurchasingState,
} from '@/actions/purchasing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
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
 *
 * It stays a single column: the create form lives in the narrow side panel of the
 * suppliers list, and a two-column grid there would squeeze every field.
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
        <p className="inline-flex items-center gap-1.5 rounded-control bg-subtle px-3 py-1.5 text-sm text-muted">
          {t('suppliers.code')}: <span className="font-mono text-ink">{supplier.code}</span>
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
        <Alert tone="danger" role="alert">
          {t(`purchases.errors.${state.errorKind}`, state.errorParams ?? {})}
        </Alert>
      )}

      {editing ? (
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Link href="/purchases/suppliers" className={buttonClasses({ variant: 'secondary' })}>
            {t('common.cancel')}
          </Link>
          <button type="submit" disabled={pending} className={buttonClasses()}>
            {pending ? '…' : t('common.save')}
          </button>
        </div>
      ) : (
        <button type="submit" disabled={pending} className={buttonClasses({ block: true })}>
          {pending ? '…' : t('common.save')}
        </button>
      )}
    </form>
  );
}
