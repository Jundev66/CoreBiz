'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { issueDeliveryNoteAction, type IssueNoteState } from '@/actions/sales';

const INITIAL: IssueNoteState = { status: 'idle' };

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
    <form action={formAction} className="space-y-6">
      <div>
        <label htmlFor="customerId" className="block text-sm font-medium">
          {t('deliveryNotes.customer')}
          <span aria-hidden="true" className="ml-0.5 text-[var(--color-danger-ink)]">
            *
          </span>
        </label>
        <select
          id="customerId"
          name="customerId"
          required
          defaultValue=""
          className="mt-1 w-full max-w-md rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
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
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('deliveryNotes.description')}</legend>

        {lines.map((line, index) => {
          const product = products.find((p) => p.id === line.productId);
          return (
            <div key={line.key} className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <label htmlFor={`line-product-${line.key}`} className="sr-only">
                  {t('products.name')} {index + 1}
                </label>
                <select
                  id={`line-product-${line.key}`}
                  name="line-product"
                  value={line.productId}
                  onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                  className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
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

              <div className="w-32">
                <label htmlFor={`line-quantity-${line.key}`} className="sr-only">
                  {t('deliveryNotes.quantity')} {index + 1}
                </label>
                <input
                  id={`line-quantity-${line.key}`}
                  name="line-quantity"
                  inputMode="decimal"
                  placeholder={t('deliveryNotes.quantity')}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                />
              </div>

              <div className="w-28">
                <label htmlFor={`line-price-${line.key}`} className="sr-only">
                  {t('deliveryNotes.unitPrice')} {index + 1}
                </label>
                <input
                  id={`line-price-${line.key}`}
                  name="line-price"
                  inputMode="decimal"
                  placeholder={product ? product.price : t('deliveryNotes.unitPrice')}
                  value={line.unitPrice}
                  onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                  className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                />
              </div>

              <div className="w-24">
                <label htmlFor={`line-discount-${line.key}`} className="sr-only">
                  {t('deliveryNotes.discount')} {index + 1}
                </label>
                <input
                  id={`line-discount-${line.key}`}
                  name="line-discount"
                  inputMode="decimal"
                  placeholder="% 0"
                  value={line.discount}
                  onChange={(e) => updateLine(line.key, { discount: e.target.value })}
                  className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                />
              </div>

              <span className="w-24 py-2 text-right text-sm tabular-nums text-[var(--color-muted)]">
                {product ? `$ ${lineTotal(line).toFixed(2)}` : ''}
              </span>

              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  aria-label={`${t('common.remove')} ${index + 1}`}
                  className="rounded-md border border-[var(--color-line)] px-3 py-2 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { key: Date.now(), productId: '', quantity: '', unitPrice: '', discount: '' },
            ])
          }
          className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm"
        >
          + {t('common.add')}
        </button>
      </fieldset>

      {/* Las notas viajaban en el contrato y en el caso de uso desde el principio, y
          ningun formulario las pedia: llegaban siempre vacias. Es donde va lo que el
          documento necesita decir y no cabe en una linea — «entregar por la puerta de
          atras», «el cliente recoge el lunes». */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          {t('deliveryNotes.notes')}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={500}
          placeholder={t('deliveryNotes.notesHint')}
          className="mt-1 w-full max-w-2xl rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-muted)]">{t('deliveryNotes.subtotal')}</span>
          <span className="tabular-nums">$ {subtotal.toFixed(2)}</span>
        </div>
        <div className="mt-1 flex justify-between font-semibold">
          <span>{t('deliveryNotes.total')}</span>
          <span className="tabular-nums">$ {estimatedTotal.toFixed(2)}</span>
        </div>
      </div>

      {state.status === 'error' && state.errorKind && (
        <p role="alert" className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      {state.status === 'success' && state.createdNumber && (
        <p role="status" className="rounded-md bg-[var(--color-brand)]/10 px-4 py-3 text-sm">
          {t('deliveryNotes.created', { number: state.createdNumber })}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-[var(--color-brand-ink)] disabled:opacity-60"
      >
        {pending ? '…' : t('common.issue')}
      </button>
    </form>
  );
}
