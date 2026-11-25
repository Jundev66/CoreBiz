'use client';

import { useActionState, useState, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { issueInvoiceAction, type InvoiceFormState } from '@/actions/invoicing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';

const INITIAL: InvoiceFormState = { status: 'idle' };

export interface InvoiceCustomerOption {
  readonly id: string;
  readonly label: string;
}

export interface InvoiceProductOption {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly price: string;
}

export interface InvoiceAccountDefaults {
  readonly receivableAccountId: string;
  readonly revenueAccountId: string;
  readonly taxPayableAccountId: string;
  readonly cashAccountId: string;
}

interface LineDraft {
  readonly key: number;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxPercentage: string;
}

export function InvoiceForm({
  customers,
  products,
  defaultDocumentNumber,
  defaultCurrency,
  defaultTaxPercentage,
  accounts,
}: {
  customers: readonly InvoiceCustomerOption[];
  products: readonly InvoiceProductOption[];
  defaultDocumentNumber: string;
  defaultCurrency: 'USD' | 'VES';
  defaultTaxPercentage: number;
  accounts: InvoiceAccountDefaults;
}) {
  const [state, formAction, pending] = useActionState(issueInvoiceAction, INITIAL);
  const [paymentCondition, setPaymentCondition] = useState<'CASH' | 'CREDIT'>('CASH');
  const [currency, setCurrency] = useState<'USD' | 'VES'>(defaultCurrency);
  const [lines, setLines] = useState<LineDraft[]>([
    {
      key: 1,
      productId: '',
      description: '',
      quantity: '1',
      unitPrice: '',
      taxPercentage: String(defaultTaxPercentage),
    },
  ]);

  const updateLine = (key: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const handleProductSelect = (key: number, productId: string) => {
    const found = products.find((p) => p.id === productId);
    if (!found) {
      updateLine(key, { productId: '' });
      return;
    }
    updateLine(key, {
      productId: found.id,
      description: found.name,
      unitPrice: found.price,
    });
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: Date.now(),
        productId: '',
        description: '',
        quantity: '1',
        unitPrice: '',
        taxPercentage: String(defaultTaxPercentage),
      },
    ]);
  };

  const removeLine = (key: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const q = Number(line.quantity.replace(',', '.')) || 0;
      const p = Number(line.unitPrice.replace(',', '.')) || 0;
      const t = Number(line.taxPercentage.replace(',', '.')) || 0;
      const lineSub = q * p;
      subtotal += lineSub;
      tax += (lineSub * t) / 100;
    }
    return {
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: (subtotal + tax).toFixed(2),
    };
  }, [lines]);

  const serializedLines = useMemo(
    () =>
      JSON.stringify(
        lines.map((l) => ({
          ...(l.productId ? { productId: l.productId } : {}),
          description: l.description,
          quantity: l.quantity || '1',
          unitPrice: l.unitPrice || '0',
          taxPercentage: Number(l.taxPercentage) || 0,
        })),
      ),
    [lines],
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="receivableAccountId" value={accounts.receivableAccountId} />
      <input type="hidden" name="revenueAccountId" value={accounts.revenueAccountId} />
      <input type="hidden" name="taxPayableAccountId" value={accounts.taxPayableAccountId} />
      <input type="hidden" name="cashAccountId" value={accounts.cashAccountId} />
      <input type="hidden" name="linesJson" value={serializedLines} />

      {state.status === 'error' && (
        <Alert tone="danger" role="alert">
          No se pudo emitir la factura. Verifica los campos, las líneas y el cliente seleccionado.
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="invoice-customer" className={LABEL_CLASSES}>
              Cliente
            </label>
            <select
              id="invoice-customer"
              name="customerId"
              required
              defaultValue=""
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            >
              <option value="" disabled>
                Selecciona un cliente...
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="invoice-number" className={LABEL_CLASSES}>
              Nro. Factura
            </label>
            <input
              id="invoice-number"
              name="documentNumber"
              type="text"
              required
              defaultValue={defaultDocumentNumber}
              className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
            />
          </div>

          <div>
            <label htmlFor="invoice-control" className={LABEL_CLASSES}>
              Nro. Control (opcional)
            </label>
            <input
              id="invoice-control"
              name="controlNumber"
              type="text"
              placeholder="00-000001"
              className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
            />
          </div>

          <div>
            <label htmlFor="invoice-currency" className={LABEL_CLASSES}>
              Moneda
            </label>
            <select
              id="invoice-currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'USD' | 'VES')}
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            >
              <option value="USD">USD</option>
              <option value="VES">VES</option>
            </select>
          </div>

          <div>
            <label htmlFor="invoice-condition" className={LABEL_CLASSES}>
              Condición de Pago
            </label>
            <select
              id="invoice-condition"
              name="paymentCondition"
              value={paymentCondition}
              onChange={(e) => setPaymentCondition(e.target.value as 'CASH' | 'CREDIT')}
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            >
              <option value="CASH">Contado (Pago Inmediato)</option>
              <option value="CREDIT">Crédito (Cuenta por Cobrar)</option>
            </select>
          </div>

          {paymentCondition === 'CREDIT' && (
            <div>
              <label htmlFor="invoice-credit-days" className={LABEL_CLASSES}>
                Días de Crédito
              </label>
              <input
                id="invoice-credit-days"
                name="creditDays"
                type="number"
                min={1}
                max={365}
                defaultValue={30}
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              />
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Líneas de la Factura</h2>
          <button
            type="button"
            onClick={addLine}
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            <Plus className="size-3.5" />
            <span>Agregar línea</span>
          </button>
        </div>

        <div className="space-y-3">
          {lines.map((line) => (
            <div
              key={line.key}
              className="grid gap-3 rounded-control border border-line bg-subtle/40 p-3 sm:grid-cols-[12rem_minmax(0,1fr)_5.5rem_6.5rem_5rem_2.5rem] sm:items-end"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Producto</label>
                <select
                  name="line-product"
                  value={line.productId}
                  onChange={(e) => handleProductSelect(line.key, e.target.value)}
                  className={CONTROL_CLASSES}
                >
                  <option value="">Ítem libre / Servicio</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Descripción</label>
                <input
                  type="text"
                  name="line-description"
                  required
                  value={line.description}
                  onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  placeholder="Descripción del producto o servicio"
                  className={CONTROL_CLASSES}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Cant.</label>
                <input
                  type="text"
                  name="line-quantity"
                  required
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  className={`text-right ${CONTROL_CLASSES}`}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Precio Unit.</label>
                <input
                  type="text"
                  name="line-price"
                  required
                  value={line.unitPrice}
                  onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                  placeholder="0.00"
                  className={`text-right ${CONTROL_CLASSES}`}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">IVA %</label>
                <input
                  type="text"
                  name="line-tax"
                  value={line.taxPercentage}
                  onChange={(e) => updateLine(line.key, { taxPercentage: e.target.value })}
                  className={`text-right ${CONTROL_CLASSES}`}
                />
              </div>

              <button
                type="button"
                onClick={() => removeLine(line.key)}
                aria-label="Eliminar línea"
                className="grid h-9 w-9 place-items-center rounded-control border border-line text-muted hover:text-danger-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-end gap-1 border-t border-line pt-4 text-sm">
          <div className="flex w-56 justify-between text-muted">
            <span>Subtotal:</span>
            <span className="font-mono">
              {totals.subtotal} {currency}
            </span>
          </div>
          <div className="flex w-56 justify-between text-muted">
            <span>Impuestos:</span>
            <span className="font-mono">
              {totals.tax} {currency}
            </span>
          </div>
          <div className="flex w-56 justify-between text-base font-bold text-ink">
            <span>Total Factura:</span>
            <span className="font-mono">
              {totals.total} {currency}
            </span>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={buttonClasses()}>
          {pending ? 'Emitiendo...' : 'Emitir Factura de Venta'}
        </button>
      </div>
    </form>
  );
}
