'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createCustomerAction, type ActionState } from '@/actions/customers';
import { Field } from '@/ui/field';

const INITIAL: ActionState = { status: 'idle' };

/**
 * Formulario de alta de cliente.
 *
 * Es de los pocos componentes de cliente del proyecto: necesita estado de envio y
 * mostrar errores del servidor. Todo lo demas se renderiza en el servidor.
 *
 * Usa `useActionState`, que degrada correctamente: si JavaScript no carga, el
 * formulario sigue enviandose como un POST normal y la Server Action responde igual.
 */
export function CustomerForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(createCustomerAction, INITIAL);

  const fieldError = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* No se pide el codigo. Lo genera el sistema al guardar —`CLT26000001`— y
          se muestra en la confirmacion. Pedirlo era pedirle al comercio que
          resolviera un problema del sistema: inventar un formato el primer dia y
          recordarlo cada vez. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="name"
          label={t('customers.name')}
          required
          error={fieldError('name')}
          autoComplete="organization"
        />
        <Field name="taxId" label={t('customers.taxId')} error={fieldError('taxId')} />
        <Field
          name="email"
          label={t('customers.email')}
          type="email"
          error={fieldError('email')}
          autoComplete="email"
        />
        <Field
          name="phone"
          label={t('customers.phone')}
          type="tel"
          error={fieldError('phone')}
          autoComplete="tel"
        />
        <Field
          name="creditLimit"
          label={t('customers.creditLimit')}
          error={fieldError('creditLimit')}

          inputMode="decimal"
          placeholder="1500,00"
        />
      </div>

      {/* La direccion. La ficha del cliente lleva enseñandola desde siempre y no habia
          forma de rellenarla: ni aqui ni por la API. En tres campos porque quien lleva
          la mercancia busca la ciudad antes que la calle. */}
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
        />
        <Field
          name="addressCity"
          label={t('customers.addressCity')}
          error={fieldError('addressCity')}
          autoComplete="address-level2"
        />
        <Field
          name="addressState"
          label={t('customers.addressState')}
          error={fieldError('addressState')}
          autoComplete="address-level1"
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
