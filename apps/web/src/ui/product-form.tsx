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
        {/* El unico codigo que se puede escribir, y a proposito: el de un producto
            suele existir ANTES que el sistema —esta en la etiqueta del estante o es
            el codigo de barras del fabricante— y obligar a llevar dos codigos para
            la misma bolsa de harina es una pelea que gana siempre el que ya esta
            pegado al producto. En blanco, lo genera el sistema. */}
        <Input
          name="sku"
          label={t('products.sku')}
          hint={t('products.skuHint')}
          autoComplete="off"
        />
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

      {/* Los dos interruptores que el dominio siempre supo respetar y ninguna pantalla
          ofrecia: todo producto nacia gravado y con existencias controladas.

          Marcados por defecto porque es el caso normal, pero destildarlos tiene efectos
          de verdad. Un servicio —una hora de instalacion— no tiene existencias que
          controlar, y sin este interruptor el sistema le vigilaria un stock que no
          existe y avisaria de que esta bajo minimo. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('products.behaviour')}</legend>
        <Check name="taxable" label={t('products.taxable')} hint={t('products.taxableHint')} />
        <Check
          name="trackStock"
          label={t('products.trackStock')}
          hint={t('products.trackStockHint')}
        />
      </fieldset>

      {state.status === 'error' && state.errorKind && (
        <p role="alert" className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      {state.status === 'success' && (
        <p role="status" className="rounded-md bg-[var(--color-brand)]/10 px-4 py-3 text-sm">
          {t('products.created', { sku: state.createdCode ?? '' })}
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
  hint,
  ...rest
}: {
  name: string;
  label: string;
  required?: boolean;
  /** Se enlaza por `aria-describedby`: un lector de pantalla lo lee con el campo. */
  hint?: string;
  inputMode?: 'decimal' | 'text';
  placeholder?: string;
  autoComplete?: string;
}) {
  const hintId = `${name}-hint`;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-[var(--color-danger-ink)]">
            *
          </span>
        )}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        {...(hint ? { 'aria-describedby': hintId } : {})}
        className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        {...rest}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-[var(--color-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Una casilla con su explicacion.
 *
 * Sin valor propio: lo que viaja es la PRESENCIA del campo. Un `input` de tipo casilla
 * sin marcar no aparece en el formulario enviado, asi que el servidor lee "marcada" como
 * presente y "sin marcar" como ausente. Funciona porque las dos casillas se pintan
 * siempre; el dia que una se pinte condicionalmente, ausente dejaria de significar "la
 * desmarco" para significar tambien "no se la enseñe".
 */
function Check({ name, label, hint }: { name: string; label: string; hint: string }) {
  const hintId = `${name}-hint`;

  return (
    <div className="flex items-start gap-2">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked
        aria-describedby={hintId}
        className="mt-1"
      />
      <div>
        <label htmlFor={name} className="text-sm font-medium">
          {label}
        </label>
        <p id={hintId} className="text-xs text-[var(--color-muted)]">
          {hint}
        </p>
      </div>
    </div>
  );
}
