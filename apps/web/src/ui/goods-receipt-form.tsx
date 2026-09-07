'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { receiveGoodsAction, type PurchasingState } from '@/actions/purchasing';

const INITIAL: PurchasingState = { status: 'idle' };

export interface SupplierOption {
  readonly id: string;
  readonly label: string;
}

export interface ReceivableProduct {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
}

interface LineDraft {
  readonly key: number;
  productId: string;
  quantity: string;
  unitCost: string;
}

/**
 * Registrar la entrada de mercancia.
 *
 * Deliberadamente igual que el formulario de emision: mismas lineas repetidas,
 * mismo boton de anadir renglon, misma forma de quitar. Quien ya sabe despachar
 * sabe recibir, y esa simetria vale mas que cualquier diferencia que pudiera
 * hacerlo "mas apropiado" para compras.
 *
 * El coste se pide por linea y no se toma del catalogo: el precio al que se
 * compra cambia con cada pedido, y rellenarlo con el ultimo coste conocido haria
 * que alguien lo aceptara sin mirar.
 */
export function GoodsReceiptForm({
  suppliers,
  products,
}: {
  suppliers: readonly SupplierOption[];
  products: readonly ReceivableProduct[];
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(receiveGoodsAction, INITIAL);
  const [lines, setLines] = useState<LineDraft[]>([
    { key: 0, productId: '', quantity: '', unitCost: '' },
  ]);

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Total orientativo. El bueno lo calcula el dominio al registrar, con su
  // propio redondeo: duplicar aqui la aritmetica exacta seria pedir que las dos
  // versiones se desincronicen tarde o temprano.
  const estimated = lines.reduce(
    (acc, line) =>
      acc +
      (Number(line.quantity.replace(',', '.')) || 0) *
        (Number(line.unitCost.replace(',', '.')) || 0),
    0,
  );

  if (suppliers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-line)] px-6 py-12 text-center text-[var(--color-muted)]">
        {t('purchases.needsSupplier')}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="supplierId" className="block text-sm font-medium">
            {t('purchases.supplier')}
          </label>
          <select
            id="supplierId"
            name="supplierId"
            required
            defaultValue=""
            className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-base"
          >
            <option value="" disabled>
              —
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="supplierReference" className="block text-sm font-medium">
            {t('purchases.reference')}
            <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">
              {t('common.optional')}
            </span>
          </label>
          <input
            id="supplierReference"
            name="supplierReference"
            aria-describedby="supplierReference-hint"
            className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-base"
          />
          <p id="supplierReference-hint" className="mt-1.5 text-xs text-[var(--color-muted)]">
            {t('purchases.referenceHint')}
          </p>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('purchases.lines')}</legend>

        {lines.map((line, index) => (
          <div key={line.key} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label
                htmlFor={`product-${line.key}`}
                className="block text-xs text-[var(--color-muted)]"
              >
                {t('purchases.product')}
              </label>
              <select
                id={`product-${line.key}`}
                name="productId"
                value={line.productId}
                onChange={(event) => update(line.key, { productId: event.target.value })}
                className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-28">
              <label
                htmlFor={`quantity-${line.key}`}
                className="block text-xs text-[var(--color-muted)]"
              >
                {t('purchases.quantity')}
              </label>
              <input
                id={`quantity-${line.key}`}
                name="quantity"
                inputMode="decimal"
                value={line.quantity}
                onChange={(event) => update(line.key, { quantity: event.target.value })}
                className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              />
            </div>

            <div className="w-32">
              <label
                htmlFor={`cost-${line.key}`}
                className="block text-xs text-[var(--color-muted)]"
              >
                {t('purchases.unitCost')}
              </label>
              <input
                id={`cost-${line.key}`}
                name="unitCost"
                inputMode="decimal"
                value={line.unitCost}
                onChange={(event) => update(line.key, { unitCost: event.target.value })}
                className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              />
            </div>

            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                className="pb-2 text-sm text-[var(--color-danger-ink)] underline underline-offset-4"
              >
                {t('common.remove')}
                <span className="sr-only"> {index + 1}</span>
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              {
                key: (prev[prev.length - 1]?.key ?? 0) + 1,
                productId: '',
                quantity: '',
                unitCost: '',
              },
            ])
          }
          className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm"
        >
          {t('common.add')}
        </button>
      </fieldset>

      <p className="text-sm text-[var(--color-muted)]">
        {t('purchases.estimatedTotal', { total: estimated.toFixed(2) })}
      </p>

      {state.status === 'error' && state.errorKind !== undefined && (
        <p
          role="alert"
          className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger-ink)]"
        >
          {t(`purchases.errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      {state.status === 'success' && (
        <p role="status" className="rounded-md bg-[var(--color-brand)]/10 px-4 py-3 text-sm">
          {t('purchases.received_ok', { number: state.createdNumber ?? '' })}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-[var(--color-brand-ink)] disabled:opacity-60"
      >
        {pending ? '…' : t('purchases.receive')}
      </button>
    </form>
  );
}
