'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createProductAction, updateProductAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';
import { Field } from '@/ui/field';

const INITIAL: ActionState = { status: 'idle' };

/**
 * Formulario de producto: alta y correccion.
 *
 * Tres campos del alta DESAPARECEN al corregir, y cada ausencia tiene su motivo:
 *
 *   - el SKU, porque suele existir antes que el sistema —esta impreso en la etiqueta
 *     del estante o es el codigo de barras del fabricante— y cambiarlo dejaria el
 *     estante diciendo una cosa y la pantalla otra;
 *   - el inventario inicial, porque el saldo solo se mueve declarando un movimiento, y
 *     para corregirlo esta el ajuste, que EXIGE un motivo;
 *   - el control de existencias, porque apagarlo con saldo distinto de cero deja ese
 *     saldo huerfano: ni desaparece ni se puede explicar.
 *
 * No es que la pantalla los esconda: el esquema los rechaza y la API responde 400 si
 * alguien los manda a mano. Esconder un campo no es una regla.
 */
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

  return (
    <form action={formAction} className="space-y-4">
      {editing && <input type="hidden" name="productId" value={product.id} />}

      {/* El SKU: escribible al crear, solo lectura al corregir. Como texto y no como un
          input deshabilitado — un input deshabilitado sigue en el DOM y sugiere que
          algun dia podria escribirse. */}
      {editing && (
        <p className="text-sm text-[var(--color-muted)]">
          {t('products.sku')}:{' '}
          <span className="font-mono text-[var(--color-ink)]">{product.sku}</span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          /* El unico codigo que se puede escribir, y a proposito: obligar a llevar dos
             codigos para la misma bolsa de harina es una pelea que gana siempre el que
             ya esta pegado al producto. En blanco, lo genera el sistema. */
          <Field
            name="sku"
            label={t('products.sku')}
            hint={t('products.skuHint')}
            autoComplete="off"
          />
        )}
        <Field
          name="name"
          label={t('products.name')}
          required
          defaultValue={valor(product?.name)}
        />
        <Field
          name="price"
          label={t('products.price')}
          required
          inputMode="decimal"
          placeholder="2,50"
          defaultValue={valor(product?.price)}
        />
        <Field
          name="cost"
          label={t('products.cost')}
          inputMode="decimal"
          defaultValue={valor(product?.cost)}
        />
        <Field
          name="unit"
          label={t('products.unit')}
          placeholder="und"
          defaultValue={valor(product?.unit)}
        />
        {!editing && (
          <Field name="initialStock" label={t('products.initialStock')} inputMode="decimal" />
        )}
        <Field
          name="minStock"
          label={t('products.minStock')}
          inputMode="decimal"
          defaultValue={valor(product?.minStock)}
        />
        {editing && (
          /* La descripcion, que el dominio guardaba desde el principio y ningun
             formulario pedia. Solo al corregir: pedirla el primer dia, cuando lo que
             se quiere es meter el catalogo deprisa, alarga un alta que ya tiene siete
             campos. */
          <Field
            name="description"
            label={t('products.description')}
            optional
            defaultValue={valor(product?.description)}
          />
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('products.behaviour')}</legend>
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

      {state.status === 'error' && state.errorKind && (
        <p role="alert" className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
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
    <div className="flex items-start gap-2">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
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
