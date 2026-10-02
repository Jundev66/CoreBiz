'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createCustomerAction, updateCustomerAction, type ActionState } from '@/actions/customers';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { Field } from '@/ui/field';
import { toast } from '@/ui/toast';

const INITIAL: ActionState = { status: 'idle' };

export interface CustomerFormValues {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly creditLimit: string | null;
  readonly addressLine1: string | null;
  readonly addressCity: string | null;
  readonly addressState: string | null;
}

export function CustomerForm({ customer }: { customer?: CustomerFormValues }) {
  const t = useTranslations();
  const editing = customer !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updateCustomerAction : createCustomerAction,
    INITIAL,
  );

  const fieldError = (field: string) => state.fieldErrors?.[field];
  const valor = (v: string | null | undefined) => v ?? '';

  useEffect(() => {
    if (state.status === 'error') {
      if (state.fieldErrors?.name) {
        toast.error('El nombre o razón social del cliente es obligatorio para guardarlo.', {
          title: 'Campo requerido',
        });
      } else if (state.fieldErrors?.email) {
        toast.warning(
          'El correo electrónico no tiene un formato válido (ej: contacto@empresa.com).',
          {
            title: 'Correo inválido',
          },
        );
      } else if (state.fieldErrors?.creditLimit) {
        toast.warning('El límite de crédito debe ser un número válido (ej: 1500,00).', {
          title: 'Monto inválido',
        });
      } else if (state.errorKind) {
        const msg = t(`errors.${state.errorKind}`, state.errorParams ?? {});
        toast.error(msg, { title: 'No se pudo guardar el cliente' });
      }
    }
  }, [state, t]);

  const handleAction = (formData: FormData) => {
    const name = formData.get('name');
    if (typeof name !== 'string' || !name.trim()) {
      toast.error('El nombre o razón social del cliente es obligatorio para guardarlo.', {
        title: 'Campo requerido',
      });
      return;
    }

    const email = formData.get('email');
    if (typeof email === 'string' && email.trim()) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email.trim())) {
        toast.warning(
          'El correo del cliente debe tener un formato válido (ejemplo: contacto@empresa.com).',
          {
            title: 'Correo no válido',
          },
        );
        return;
      }
    }

    const creditLimit = formData.get('creditLimit');
    if (typeof creditLimit === 'string' && creditLimit.trim()) {
      const val = Number(creditLimit.trim().replace(',', '.'));
      if (isNaN(val) || val < 0) {
        toast.warning(
          'El límite de crédito debe ser un importe numérico mayor o igual a 0 (ejemplo: 1500,00).',
          {
            title: 'Monto inválido',
          },
        );
        return;
      }
    }

    formAction(formData);
  };

  return (
    <form action={handleAction} className="space-y-6" noValidate>
      {editing && <input type="hidden" name="customerId" value={customer.id} />}

      {/* Al dar de alta no se pide el codigo: lo genera el sistema —`CLT26000001`— y
          se muestra en la confirmacion. Pedirlo era pedirle al comercio que resolviera
          un problema del sistema: inventar un formato el primer dia y recordarlo cada
          vez. Al corregir ya existe, asi que se enseña. */}
      {editing && (
        <p className="inline-flex items-center gap-1.5 rounded-control bg-subtle px-3 py-1.5 text-sm text-muted">
          {t('customers.code')}: <span className="font-mono text-ink">{customer.code}</span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="name"
          label={t('customers.name')}
          required
          error={fieldError('name')}
          autoComplete="organization"
          defaultValue={valor(customer?.name)}
        />
        <Field
          name="taxId"
          label={t('customers.taxId')}
          error={fieldError('taxId')}
          defaultValue={valor(customer?.taxId)}
        />
        <Field
          name="email"
          label={t('customers.email')}
          type="email"
          error={fieldError('email')}
          autoComplete="email"
          defaultValue={valor(customer?.email)}
        />
        <Field
          name="phone"
          label={t('customers.phone')}
          type="tel"
          error={fieldError('phone')}
          autoComplete="tel"
          defaultValue={valor(customer?.phone)}
        />
        <Field
          name="creditLimit"
          label={t('customers.creditLimit')}
          error={fieldError('creditLimit')}
          inputMode="decimal"
          placeholder="1500,00"
          defaultValue={valor(customer?.creditLimit)}
        />
      </div>

      {/* La direccion. En tres campos porque quien lleva la mercancia busca la ciudad
          antes que la calle. */}
      <div className="border-t border-line pt-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          {/* El grupo se distingue de sus campos: mismo peso y mismo tamaño que las
              etiquetas de dentro hacia que "Direccion" pareciera un campo mas. */}
          <legend className="mb-4 text-base font-semibold text-ink">
            {t('customers.address')}
          </legend>
          <div className="sm:col-span-2">
            <Field
              name="addressLine1"
              label={t('customers.addressLine1')}
              error={fieldError('addressLine1')}
              autoComplete="address-line1"
              defaultValue={valor(customer?.addressLine1)}
            />
          </div>
          <Field
            name="addressCity"
            label={t('customers.addressCity')}
            error={fieldError('addressCity')}
            autoComplete="address-level2"
            defaultValue={valor(customer?.addressCity)}
          />
          <Field
            name="addressState"
            label={t('customers.addressState')}
            error={fieldError('addressState')}
            autoComplete="address-level1"
            defaultValue={valor(customer?.addressState)}
          />
        </fieldset>
      </div>

      {/* El aviso ocupa sitio siempre que hay mensaje, y se anuncia a lectores de
          pantalla: un error que solo se ve no sirve a todo el mundo. */}
      {state.status === 'error' && state.errorKind && !state.fieldErrors && (
        <Alert tone="danger" role="alert">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-6 sm:flex-row sm:justify-end">
        <Link
          href={editing ? `/customers/${customer.id}` : '/customers'}
          className={buttonClasses({ variant: 'secondary' })}
        >
          {t('common.cancel')}
        </Link>
        <button type="submit" disabled={pending} className={buttonClasses()}>
          {pending ? '…' : t('common.save')}
        </button>
      </div>
    </form>
  );
}
