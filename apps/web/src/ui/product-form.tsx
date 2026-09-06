'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createProductAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';

const INITIAL: ActionState = { status: 'idle' };

export function ProductForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(createProductAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="sku" label={t('products.sku')} required autoComplete="off" />
        <Input name="name" label={t('products.name')} required />
        <Input
          name="price"
          label={t('products.price')}
          required
          inputMode="decimal"
          placeholder="2,50"
        />
        <Input name="cost" label={t('products.cost')} inputMode="decimal" />
        <Input name="unit" label={t('products.unit')} placeholder="und" />
        <Input name="initialStock" label={t('products.initialStock')} inputMode="decimal" />
        <Input name="minStock" label={t('products.minStock')} inputMode="decimal" />
      </div>

      {state.status === 'error' && state.errorKind && (
        <p role="alert" className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      {state.status === 'success' && (
        <p role="status" className="rounded-md bg-[var(--color-brand)]/10 px-4 py-3 text-sm">
          {t('products.created')}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-[var(--color-brand-ink)] disabled:opacity-60"
      >
        {pending ? '…' : t('common.save')}
      </button>
    </form>
  );
}

function Input({
  name,
  label,
  required,
  ...rest
}: {
  name: string;
  label: string;
  required?: boolean;
  inputMode?: 'decimal' | 'text';
  placeholder?: string;
  autoComplete?: string;
}) {
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
        required={required}
        className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        {...rest}
      />
    </div>
  );
}
