'use client';

import { useActionState, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { issueDeliveryNoteAction, type IssueNoteState } from '@/actions/sales';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES, TEXTAREA_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';

const INITIAL: IssueNoteState = { status: 'idle' };

/*
 * One line: a stacked card on a phone, a compact row from `sm` up. The labels are visible
 * on the phone, where there is no column header to explain each box, and become
 * screen-reader-only in the row, where the header above does that job.
 */
const LINE_GRID = 'sm:grid-cols-[minmax(0,1fr)_6rem_6.5rem_5rem_6rem_2.5rem]';
const LINE_LABEL = 'mb-1 block text-xs font-medium text-muted sm:sr-only';

export interface CustomerOption {
  readonly id: string;
  readonly label: string;
}

export interface ProductOption {
  readonly id: string;
  readonly label: string;
  readonly price: string;
  readonly unit: string;
  readonly stock: string | null;
}

interface LineDraft {
  readonly key: number;
  productId: string;
  quantity: string;
  /** Vacio significa "el precio de catalogo": no es lo mismo que cero. */
  unitPrice: string;
  /** En porcentaje, que es como se habla. Se convierte a puntos basicos en la accion. */
  discount: string;
}

/**
 * Formulario de emision de notas de entrega.
 *
 * Las lineas se envian como campos repetidos y el servidor las empareja por posicion.
 * El total que se muestra aqui es ORIENTATIVO: el calculo bueno lo hace el dominio al
 * emitir, con su propio redondeo. Duplicar aqui la aritmetica exacta seria pedir que
 * las dos versiones se desincronicen tarde o temprano.
 *
 * El precio por linea se deja VACIO por defecto y el marcador de posicion enseña el de
 * catalogo. Rellenarlo con el precio de catalogo tendria un efecto feo: el documento
 * quedaria con un precio pactado que nadie pacto, y el dia que suba la tarifa nadie
 * sabria si aquella venta llevaba precio propio o simplemente se copio el del momento.
 */
export function DeliveryNoteForm({
  customers,
  products,
  taxRateBp,
}: {
  customers: readonly CustomerOption[];
  products: readonly ProductOption[];
  taxRateBp: number;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(issueDeliveryNoteAction, INITIAL);
  const [lines, setLines] = useState<LineDraft[]>([
    { key: 0, productId: '', quantity: '', unitPrice: '', discount: '' },
  ]);

  const catalogPrice = (productId: string) =>
    Number(products.find((p) => p.id === productId)?.price ?? '0');

  const decimal = (raw: string) => Number(raw.replace(',', '.'));

  /** El precio tecleado manda sobre el de catalogo; vacio o ilegible, el de catalogo. */
  const priceOf = (line: LineDraft) => {
    const typed = decimal(line.unitPrice);
    return line.unitPrice.trim() !== '' && Number.isFinite(typed)
      ? typed
      : catalogPrice(line.productId);
  };

  const lineTotal = (line: LineDraft) => {
    const quantity = decimal(line.quantity) || 0;
    const discount = decimal(line.discount) || 0;
    return priceOf(line) * quantity * (1 - discount / 100);
  };

  const subtotal = lines.reduce((acc, line) => acc + lineTotal(line), 0);
  const estimatedTotal = subtotal * (1 + taxRateBp / 10_000);

  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form
      action={formAction}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"
    >
      <div className="min-w-0 space-y-6">
        <Card className="p-5 sm:p-6">
          <label htmlFor="customerId" className={LABEL_CLASSES}>
            {t('deliveryNotes.customer')}
            <span aria-hidden="true" className="ml-0.5 text-danger-ink">
              *
            </span>
          </label>
          <select
            id="customerId"
            name="customerId"
            required
            defaultValue=""
            className={`mt-1.5 ${CONTROL_CLASSES} sm:max-w-md`}
          >
            <option value="" disabled>
              —
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </select>
        </Card>

        <Card className="p-5 sm:p-6">
          <fieldset className="space-y-3">
            <legend className="mb-4 text-base font-semibold text-ink">
              {t('deliveryNotes.description')}
            </legend>

            {/* Column header for the compact row. Decorative: every box carries its own
                label, so a screen reader hears it once per field instead of twice. */}
            <div
              aria-hidden="true"
              className={`hidden gap-3 border-b border-line pb-2 text-xs font-medium text-muted sm:grid ${LINE_GRID}`}
            >
              <span>{t('purchases.product')}</span>
              <span>{t('deliveryNotes.quantity')}</span>
              <span>{t('deliveryNotes.unitPrice')}</span>
              <span>{t('deliveryNotes.discount')}</span>
              <span className="text-right">{t('deliveryNotes.lineTotal')}</span>
            </div>

            {lines.map((line, index) => {
              const product = products.find((p) => p.id === line.productId);
              return (
                <div
                  key={line.key}
                  className="rounded-control border border-line bg-canvas p-3 sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <div className={`grid grid-cols-2 items-end gap-3 sm:items-center ${LINE_GRID}`}>
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <label htmlFor={`line-product-${line.key}`} className={LINE_LABEL}>
                        {t('purchases.product')}
                        <span className="sr-only"> {index + 1}</span>
                      </label>
                      <select
                        id={`line-product-${line.key}`}
                        name="line-product"
                        value={line.productId}
                        onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                        className={CONTROL_CLASSES}
                      >
                        <option value="">—</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label} · $ {p.price}
                            {p.stock !== null ? ` · ${p.stock} ${p.unit}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`line-quantity-${line.key}`} className={LINE_LABEL}>
                        {t('deliveryNotes.quantity')}
                        <span className="sr-only"> {index + 1}</span>
                      </label>
                      <input
                        id={`line-quantity-${line.key}`}
                        name="line-quantity"
                        inputMode="decimal"
                        placeholder={t('deliveryNotes.quantity')}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        className={CONTROL_CLASSES}
                      />
                    </div>

                    <div>
                      <label htmlFor={`line-price-${line.key}`} className={LINE_LABEL}>
                        {t('deliveryNotes.unitPrice')}
                        <span className="sr-only"> {index + 1}</span>
                      </label>
                      <input
                        id={`line-price-${line.key}`}
                        name="line-price"
                        inputMode="decimal"
                        placeholder={product ? product.price : t('deliveryNotes.unitPrice')}
                        value={line.unitPrice}
                        onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                        className={CONTROL_CLASSES}
                      />
                    </div>

                    <div>
                      <label htmlFor={`line-discount-${line.key}`} className={LINE_LABEL}>
                        {t('deliveryNotes.discount')}
                        <span className="sr-only"> {index + 1}</span>
                      </label>
                      <input
                        id={`line-discount-${line.key}`}
                        name="line-discount"
                        inputMode="decimal"
                        placeholder="% 0"
                        value={line.discount}
                        onChange={(e) => updateLine(line.key, { discount: e.target.value })}
                        className={CONTROL_CLASSES}
                      />
                    </div>

                    <div className="text-right">
                      <span
                        aria-hidden="true"
                        className="mb-1 block text-xs font-medium text-muted sm:hidden"
                      >
                        {t('deliveryNotes.lineTotal')}
                      </span>
                      <span className="flex h-10 items-center justify-end text-sm font-medium text-ink tabular-nums">
                        {product ? `$ ${lineTotal(line).toFixed(2)}` : '—'}
                      </span>
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
              );
            })}

            <div className="pt-1">
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { key: Date.now(), productId: '', quantity: '', unitPrice: '', discount: '' },
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

        {/* Las notas viajaban en el contrato y en el caso de uso desde el principio, y
            ningun formulario las pedia: llegaban siempre vacias. Es donde va lo que el
            documento necesita decir y no cabe en una linea — «entregar por la puerta de
            atras», «el cliente recoge el lunes». */}
        <Card className="p-5 sm:p-6">
          <label htmlFor="notes" className={LABEL_CLASSES}>
            {t('deliveryNotes.notes')}
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={500}
            placeholder={t('deliveryNotes.notesHint')}
            className={`mt-1.5 ${TEXTAREA_CLASSES}`}
          />
        </Card>
      </div>

      {/* The summary and the ONLY submit button. On a phone it stays pinned above the tab
          bar while the lines scroll; from `lg` it sits beside them, pinned to the top. */}
      <div data-pinned-summary className="sticky bottom-20 z-10 space-y-3 lg:top-6 lg:bottom-auto">
        {state.status === 'error' && state.errorKind && (
          <Alert tone="danger" role="alert" className="shadow-sm">
            {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
          </Alert>
        )}

        {/* On a phone it is ONE compact row — total on the left, the button on the right — so
            the pinned bar never covers the line being typed. The full card returns at `sm`. */}
        <Card className="flex items-center gap-4 p-3 shadow-md sm:block sm:p-5 lg:shadow-xs">
          <dl className="min-w-0 flex-1 space-y-1.5 text-sm">
            <div className="hidden justify-between gap-4 sm:flex">
              <dt className="text-muted">{t('deliveryNotes.subtotal')}</dt>
              <dd className="text-ink tabular-nums">$ {subtotal.toFixed(2)}</dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:border-t sm:border-line sm:pt-2">
              <dt className="text-xs text-muted sm:text-sm sm:font-semibold sm:text-ink">
                {t('deliveryNotes.total')}
              </dt>
              <dd className="text-lg font-semibold text-ink tabular-nums">
                $ {estimatedTotal.toFixed(2)}
              </dd>
            </div>
          </dl>

          <button
            type="submit"
            disabled={pending}
            className={buttonClasses({ size: 'lg', className: 'shrink-0 sm:mt-4 sm:w-full' })}
          >
            {pending ? '…' : t('common.issue')}
          </button>
        </Card>
      </div>
    </form>
  );
}
