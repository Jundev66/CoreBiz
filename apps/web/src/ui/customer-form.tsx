'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createCustomerAction, type ActionState } from '@/actions/customers';

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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="code"
          label={t('customers.code')}
          required
          error={fieldError('code')}
          t={t}
          autoComplete="off"
        />
        <Field
          name="name"
          label={t('customers.name')}
          required
          error={fieldError('name')}
          t={t}
          autoComplete="organization"
        />
        <Field name="taxId" label={t('customers.taxId')} error={fieldError('taxId')} t={t} />
        <Field
          name="email"
          label={t('customers.email')}
          type="email"
          error={fieldError('email')}
          t={t}
          autoComplete="email"
        />
        <Field
          name="phone"
          label={t('customers.phone')}
          type="tel"
          error={fieldError('phone')}
          t={t}
          autoComplete="tel"
        />
        <Field
          name="creditLimit"
          label={t('customers.creditLimit')}
          error={fieldError('creditLimit')}
          t={t}
          inputMode="decimal"
          placeholder="1500,00"
        />
      </div>

      {/* El aviso ocupa sitio siempre que hay mensaje, y se anuncia a lectores de
          pantalla: un error que solo se ve no sirve a todo el mundo. */}
      {state.status === 'error' && state.errorKind && !state.fieldErrors && (
        <p role="alert" className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      {state.status === 'success' && (
        <p role="status" className="rounded-md bg-[var(--color-brand)]/10 px-4 py-3 text-sm">
          {t('customers.created')}
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

interface FieldProps {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  error?: string | undefined;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: 'decimal' | 'text';
  t: ReturnType<typeof useTranslations>;
}

function Field({ name, label, type = 'text', required, error, t, ...rest }: FieldProps) {
  const errorId = `${name}-error`;
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-[var(--color-danger)]">
            *
          </span>
        )}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        {...rest}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs text-[var(--color-danger)]">
          {t(`errors.${error}`, { field: label })}
        </p>
      )}
    </div>
  );
}
