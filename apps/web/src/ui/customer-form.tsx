'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createCustomerAction, updateCustomerAction, type ActionState } from '@/actions/customers';
import { Field } from '@/ui/field';

const INITIAL: ActionState = { status: 'idle' };

/**
 * Formulario de cliente: sirve para dar de alta y para corregir.
 *
 * UNO y no dos. Los campos, sus validaciones, el orden, los `autoComplete` y el
 * cableado de accesibilidad son identicos en los dos casos; duplicarlo garantizaria
 * que dentro de dos meses el alta pida un campo que la correccion no, o al reves.
 *
 * Lo que cambia entre los dos modos es exactamente esto:
 *
 *   - la Server Action a la que envia,
 *   - los valores iniciales,
 *   - un campo oculto con el identificador,
 *   - y que el CODIGO se pinte, porque al corregir ya existe.
 *
 * El codigo se pinta como TEXTO, nunca como un input deshabilitado. Un input
 * deshabilitado sigue estando en el DOM y sugiere que en algun momento podria
 * escribirse; el codigo no se cambia nunca, asi que no es un campo del formulario.
 */
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

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {editing && <input type="hidden" name="customerId" value={customer.id} />}

      {/* Al dar de alta no se pide el codigo: lo genera el sistema —`CLT26000001`— y
          se muestra en la confirmacion. Pedirlo era pedirle al comercio que resolviera
          un problema del sistema: inventar un formato el primer dia y recordarlo cada
          vez. Al corregir ya existe, asi que se enseña. */}
      {editing && (
        <p className="text-sm text-[var(--color-muted)]">
          {t('customers.code')}:{' '}
          <span className="font-mono text-[var(--color-ink)]">{customer.code}</span>
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
      <fieldset className="grid gap-4 sm:grid-cols-2">
        {/* El grupo se distingue de sus campos: mismo peso y mismo tamaño que las
            etiquetas de dentro hacia que "Direccion" pareciera un campo mas. */}
        <legend className="mb-2 text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          {t('customers.address')}
        </legend>
        <Field
          name="addressLine1"
          label={t('customers.addressLine1')}
          error={fieldError('addressLine1')}
          autoComplete="address-line1"
          defaultValue={valor(customer?.addressLine1)}
        />
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

      {/* El aviso ocupa sitio siempre que hay mensaje, y se anuncia a lectores de
          pantalla: un error que solo se ve no sirve a todo el mundo. */}
      {state.status === 'error' && state.errorKind && !state.fieldErrors && (
        <p role="alert" className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-[var(--color-brand-ink)] transition disabled:opacity-60"
      >
        {pending ? '…' : t('common.save')}
      </button>
    </form>
  );
}
