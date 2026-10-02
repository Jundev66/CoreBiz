'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createProductAction, updateProductAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { Field } from '@/ui/field';
import { toast } from '@/ui/toast';

const INITIAL: ActionState = { status: 'idle' };

export interface ProductFormValues {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly price: string;
  readonly cost: string | null;
  readonly unit: string;
  readonly minStock: string | null;
  readonly description: string | null;
  readonly taxable: boolean;
}

export function ProductForm({ product }: { product?: ProductFormValues }) {
  const t = useTranslations();
  const editing = product !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updateProductAction : createProductAction,
    INITIAL,
  );

  const valor = (v: string | null | undefined) => v ?? '';
  const fieldError = (field: string) => state.fieldErrors?.[field];

  useEffect(() => {
    if (state.status === 'error') {
      if (state.fieldErrors?.name) {
        toast.error('El nombre del producto es obligatorio para registrarlo en el catálogo.', {
          title: 'Campo requerido',
        });
      } else if (state.fieldErrors?.price) {
        toast.error('El precio de venta es obligatorio y debe ser un importe numérico válido.', {
          title: 'Precio requerido',
        });
      } else if (state.fieldErrors?.cost) {
        toast.warning('El costo debe ser un importe numérico válido.', {
          title: 'Costo inválido',
        });
      } else if (state.fieldErrors?.sku) {
        toast.warning('El código SKU ingresado no tiene un formato válido.', {
          title: 'SKU inválido',
        });
      } else if (state.errorKind) {
        const msg = t(`errors.${state.errorKind}`, state.errorParams ?? {});
        toast.error(msg, { title: 'No se pudo guardar el producto' });
      }
    }
  }, [state, t]);

  const handleAction = (formData: FormData) => {
    const name = formData.get('name');
    if (typeof name !== 'string' || !name.trim()) {
      toast.error('El nombre del producto es obligatorio para registrarlo en el catálogo.', {
        title: 'Campo requerido',
      });
      return;
    }

    const price = formData.get('price');
    if (typeof price !== 'string' || !price.trim()) {
      toast.error(
        'El precio de venta es obligatorio y debe ser un importe numérico válido (ejemplo: 2,50).',
        {
          title: 'Precio requerido',
        },
      );
      return;
    }
    const p = Number(price.trim().replace(',', '.'));
    if (isNaN(p) || p < 0) {
      toast.error('El precio de venta debe ser un número válido mayor o igual a 0.', {
        title: 'Precio inválido',
      });
      return;
    }

    formAction(formData);
  };

  return (
    <form action={handleAction} className="space-y-6">
      {editing && <input type="hidden" name="productId" value={product.id} />}

      {editing && (
        <p className="inline-flex items-center gap-1.5 rounded-control bg-subtle px-3 py-1.5 text-sm text-muted">
          {t('products.sku')}: <span className="font-mono text-ink">{product.sku}</span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <Field
            name="sku"
            label={t('products.sku')}
            hint={t('products.skuHint')}
            autoComplete="off"
            error={fieldError('sku')}
          />
        )}
        <Field
          name="name"
          label={t('products.name')}
          required
          defaultValue={valor(product?.name)}
          error={fieldError('name')}
        />
        <Field
          name="price"
          label={t('products.price')}
          required
          inputMode="decimal"
          placeholder="2,50"
          defaultValue={valor(product?.price)}
          error={fieldError('price')}
        />
        <Field
          name="cost"
          label={t('products.cost')}
          inputMode="decimal"
          defaultValue={valor(product?.cost)}
          error={fieldError('cost')}
        />
        <Field
          name="unit"
          label={t('products.unit')}
          placeholder="und"
          defaultValue={valor(product?.unit)}
          error={fieldError('unit')}
        />
        {!editing && (
          <Field
            name="initialStock"
            label={t('products.initialStock')}
            inputMode="decimal"
            error={fieldError('initialStock')}
          />
        )}
        <Field
          name="minStock"
          label={t('products.minStock')}
          inputMode="decimal"
          defaultValue={valor(product?.minStock)}
          error={fieldError('minStock')}
        />
        {editing && (
          <div className="sm:col-span-2">
            <Field
              name="description"
              label={t('products.description')}
              optional
              defaultValue={valor(product?.description)}
              error={fieldError('description')}
            />
          </div>
        )}
      </div>

      <div className="border-t border-line pt-6">
        <fieldset className="space-y-4">
          <legend className="mb-4 text-base font-semibold text-ink">
            {t('products.behaviour')}
          </legend>
          {/* Al corregir solo queda el impuesto. `trackStock` se va con el inventario
              inicial: apagarlo dejaria el saldo sin nada que lo explique. */}
          <Check
            name="taxable"
            label={t('products.taxable')}
            hint={t('products.taxableHint')}
            defaultChecked={product?.taxable ?? true}
          />
          {!editing && (
            <Check
              name="trackStock"
              label={t('products.trackStock')}
              hint={t('products.trackStockHint')}
              defaultChecked
            />
          )}
        </fieldset>
      </div>

      {state.status === 'error' && state.errorKind && (
        <Alert tone="danger" role="alert">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-6 sm:flex-row sm:justify-end">
        <Link
          href={editing ? `/products/${product.id}` : '/products'}
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

/**
 * Una casilla con su explicacion.
 *
 * Sin valor propio: lo que viaja es la PRESENCIA del campo. Un `input` de tipo casilla
 * sin marcar no aparece en el formulario enviado, asi que el servidor lee "marcada" como
 * presente y "sin marcar" como ausente.
 *
 * ESO OBLIGA A ALGO EN EL SERVIDOR, y esta escrito tambien en `parseProductUpdateForm`:
 * `taxable` se lee mirando si la clave existe, no con el bucle que recorre los campos.
 * Leerlo con el bucle lo dejaria como `undefined` —"no me lo has dado"— y la casilla no
 * se podria desmarcar nunca.
 *
 * Aqui `trackStock` se pinta solo al crear, y esa condicionalidad es justo el caso que
 * el comentario anterior de este archivo advertia: al corregir, su ausencia ya no
 * significa "la desmarco". Por eso el esquema de correccion NO lo acepta, en lugar de
 * aceptarlo y adivinar.
 */
function Check({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked?: boolean;
}) {
  const hintId = `${name}-hint`;

  return (
    <div className="flex items-start gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        aria-describedby={hintId}
        className="mt-0.5 size-4 shrink-0 accent-brand"
      />
      <div className="min-w-0">
        <label htmlFor={name} className="text-sm font-medium text-ink">
          {label}
        </label>
        <p id={hintId} className="mt-0.5 text-xs text-muted">
          {hint}
        </p>
      </div>
    </div>
  );
}
