'use client';

import { useActionState, useState } from 'react';
import { Plus, Truck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { receiveGoodsAction, type PurchasingState } from '@/actions/purchasing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, Field, LABEL_CLASSES, TEXTAREA_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';

const INITIAL: PurchasingState = { status: 'idle' };

/* Same line layout as the delivery note editor: a card on a phone, a row from `sm` up. */
const LINE_GRID = 'sm:grid-cols-[minmax(0,1fr)_7rem_8rem_2.5rem]';
const LINE_LABEL = 'mb-1 block text-xs font-medium text-muted sm:sr-only';

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
      <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
        <span className="grid size-11 place-items-center rounded-pill bg-subtle text-muted">
          <Truck aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </span>
        <p className="mt-3 max-w-sm text-sm text-muted">{t('purchases.needsSupplier')}</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"
    >
      <div className="min-w-0 space-y-6">
        <Card className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="supplierId" className={LABEL_CLASSES}>
                {t('purchases.supplier')}
              </label>
              <select
                id="supplierId"
                name="supplierId"
                required
                defaultValue=""
                className={`mt-1.5 ${CONTROL_CLASSES}`}
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

            <Field
              name="supplierReference"
              label={t('purchases.reference')}
              optional
              hint={t('purchases.referenceHint')}
            />

            {/* Las notas se pintaban en el detalle de la recepcion y no habia forma de
                escribirlas: salian siempre vacias. Aqui va lo que la recepcion necesita
                explicar y no cabe en la referencia — «faltaron dos cajas», «llego con el
                precio cambiado». */}
            <div className="sm:col-span-2">
              <label htmlFor="notes" className={LABEL_CLASSES}>
                {t('purchases.notes')}
                <span className="ml-1.5 text-xs font-normal text-muted">
                  {t('common.optional')}
                </span>
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                maxLength={500}
                placeholder={t('purchases.notesHint')}
                className={`mt-1.5 ${TEXTAREA_CLASSES}`}
              />
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <fieldset className="space-y-3">
            <legend className="mb-4 text-base font-semibold text-ink">
              {t('purchases.lines')}
            </legend>

            {/* Column header for the compact row; each box keeps its own label. */}
            <div
              aria-hidden="true"
              className={`hidden gap-3 border-b border-line pb-2 text-xs font-medium text-muted sm:grid ${LINE_GRID}`}
            >
              <span>{t('purchases.product')}</span>
              <span>{t('purchases.quantity')}</span>
              <span>{t('purchases.unitCost')}</span>
            </div>

            {lines.map((line, index) => (
              <div
                key={line.key}
                className="rounded-control border border-line bg-canvas p-3 sm:border-0 sm:bg-transparent sm:p-0"
              >
                <div className={`grid grid-cols-2 items-end gap-3 sm:items-center ${LINE_GRID}`}>
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <label htmlFor={`product-${line.key}`} className={LINE_LABEL}>
                      {t('purchases.product')}
                    </label>
                    <select
                      id={`product-${line.key}`}
                      name="productId"
                      value={line.productId}
                      onChange={(event) => update(line.key, { productId: event.target.value })}
                      className={CONTROL_CLASSES}
                    >
                      <option value="">—</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`quantity-${line.key}`} className={LINE_LABEL}>
                      {t('purchases.quantity')}
                    </label>
                    <input
                      id={`quantity-${line.key}`}
                      name="quantity"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) => update(line.key, { quantity: event.target.value })}
                      className={CONTROL_CLASSES}
                    />
                  </div>

                  <div>
                    <label htmlFor={`cost-${line.key}`} className={LINE_LABEL}>
                      {t('purchases.unitCost')}
                    </label>
                    <input
                      id={`cost-${line.key}`}
                      name="unitCost"
                      inputMode="decimal"
                      value={line.unitCost}
                      onChange={(event) => update(line.key, { unitCost: event.target.value })}
                      className={CONTROL_CLASSES}
                    />
                  </div>

                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                      aria-label={`${t('common.remove')} ${index + 1}`}
                      className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-control border border-line bg-surface text-sm font-medium text-danger-ink transition-colors hover:bg-danger-soft sm:col-span-1 sm:size-10 sm:border-0 sm:bg-transparent"
                    >
                      <X aria-hidden="true" className="size-4" strokeWidth={2} />
                      <span aria-hidden="true" className="sm:hidden">
                        {t('common.remove')}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="pt-1">
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
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                {t('common.add')}
              </button>
            </div>
          </fieldset>
        </Card>
      </div>

      {/* Summary and the only submit button: pinned above the tab bar on a phone, beside
          the lines from `lg`. */}
      <div data-pinned-summary className="sticky bottom-20 z-10 space-y-3 lg:top-6 lg:bottom-auto">
        {state.status === 'error' && state.errorKind !== undefined && (
          <Alert tone="danger" role="alert" className="shadow-sm">
            {t(`purchases.errors.${state.errorKind}`, state.errorParams ?? {})}
          </Alert>
        )}

        {/* One compact row on a phone so the pinned bar never covers the line being typed. */}
        <Card className="flex items-center gap-4 p-3 shadow-md sm:block sm:p-5 lg:shadow-xs">
          <p className="min-w-0 flex-1 text-sm font-medium text-ink tabular-nums">
            {t('purchases.estimatedTotal', { total: estimated.toFixed(2) })}
          </p>

          <button
            type="submit"
            disabled={pending}
            className={buttonClasses({ size: 'lg', className: 'shrink-0 sm:mt-4 sm:w-full' })}
          >
            {pending ? '…' : t('purchases.receive')}
          </button>
        </Card>
      </div>
    </form>
  );
}
