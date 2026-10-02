'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  createSupplierAction,
  updateSupplierAction,
  type PurchasingState,
} from '@/actions/purchasing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { Field } from '@/ui/field';
import { toast } from '@/ui/toast';

const INITIAL: PurchasingState = { status: 'idle' };

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

  useEffect(() => {
    if (state.status === 'error') {
      if (state.fieldErrors?.name) {
        toast.error('El nombre o razón social del proveedor es obligatorio para registrarlo.', {
          title: 'Campo requerido',
        });
      } else if (state.fieldErrors?.email) {
        toast.warning(
          'El correo del proveedor no tiene un formato válido (ej: proveedor@empresa.com).',
          {
            title: 'Correo inválido',
          },
        );
      } else if (state.errorKind) {
        toast.error(t(`purchases.errors.${state.errorKind}`, state.errorParams ?? {}));
      }
    }
  }, [state, t]);

  const handleAction = (formData: FormData) => {
    const name = formData.get('name');
    if (typeof name !== 'string' || !name.trim()) {
      toast.error('El nombre o razón social del proveedor es obligatorio para guardarlo.', {
        title: 'Campo requerido',
      });
      return;
    }

    const email = formData.get('email');
    if (typeof email === 'string' && email.trim()) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email.trim())) {
        toast.warning('El correo electrónico del proveedor no tiene un formato válido.', {
          title: 'Correo no válido',
        });
        return;
      }
    }

    formAction(formData);
  };

  return (
    <form action={handleAction} className="space-y-4">
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
