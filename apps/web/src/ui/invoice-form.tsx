'use client';

import { useActionState, useState, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { issueInvoiceAction, type InvoiceFormState } from '@/actions/invoicing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';
import {
  buildInstallmentPreview,
  convertCurrencyAmount,
  DOCUMENT_PAYMENT_METHODS,
  type InstallmentFrequencyOption,
} from '@/ui/payment-methods';

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
  readonly taxPercentage?: string | null;
}

export interface InvoiceAccountDefaults {
  readonly receivableAccountId: string;
  readonly revenueAccountId: string;
  readonly taxPayableAccountId: string;
  readonly cashAccountId: string;
}

export interface InvoiceTaxOption {
  readonly id: string;
  readonly label: string;
  readonly percentage: string;
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
  defaultExchangeRate = 50,
  defaultTaxPercentage,
  taxRates = [],
  accounts,
  accountingConfigured = true,
}: {
  customers: readonly InvoiceCustomerOption[];
  products: readonly InvoiceProductOption[];
  defaultDocumentNumber: string;
  defaultCurrency: 'USD' | 'VES';
  defaultExchangeRate?: number;
  defaultTaxPercentage: number;
  taxRates?: readonly InvoiceTaxOption[];
  accounts: InvoiceAccountDefaults;
  accountingConfigured?: boolean;
}) {
  const [state, formAction, pending] = useActionState(issueInvoiceAction, INITIAL);
  const [paymentCondition, setPaymentCondition] = useState<'CASH' | 'CREDIT'>('CREDIT');
  const [installmentFrequency, setInstallmentFrequency] =
    useState<InstallmentFrequencyOption>('SINGLE');
  const [installmentCount, setInstallmentCount] = useState<string>('3');
  const [creditDays, setCreditDays] = useState<string>('30');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH_USD');
  const [currency, setCurrency] = useState<'USD' | 'VES'>(defaultCurrency);
  const [exchangeRate, setExchangeRate] = useState<string>(String(defaultExchangeRate));
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

  const activeRate = Number.parseFloat(exchangeRate.replace(',', '.')) || defaultExchangeRate || 50;

  const updateLine = (key: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const handleCurrencyChange = (nextCurrency: 'USD' | 'VES') => {
    if (nextCurrency === currency) return;
    setLines((prev) =>
      prev.map((l) => {
        const numeric = Number.parseFloat(l.unitPrice.replace(',', '.'));
        if (!Number.isFinite(numeric) || numeric <= 0) return l;
        const converted = convertCurrencyAmount(numeric, currency, nextCurrency, activeRate);
        return { ...l, unitPrice: converted.toFixed(2) };
      }),
    );
    setCurrency(nextCurrency);
    if (nextCurrency === 'VES' && paymentMethod === 'CASH_USD') {
      setPaymentMethod('CASH_VES');
    } else if (nextCurrency === 'USD' && paymentMethod === 'CASH_VES') {
      setPaymentMethod('CASH_USD');
    }
  };

  const handleProductSelect = (key: number, productId: string) => {
    const found = products.find((p) => p.id === productId);
    if (!found) {
      updateLine(key, { productId: '' });
      return;
    }
    const baseUsd = Number.parseFloat(found.price.replace(',', '.')) || 0;
    const priceInCurrency = currency === 'VES' ? (baseUsd * activeRate).toFixed(2) : found.price;
    updateLine(key, {
      productId: found.id,
      description: found.name,
      unitPrice: priceInCurrency,
      taxPercentage:
        found.taxPercentage !== undefined && found.taxPercentage !== null
          ? found.taxPercentage
          : String(defaultTaxPercentage),
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
              readOnly
              aria-readonly="true"
              defaultValue={defaultDocumentNumber}
              className={`mt-1.5 font-mono bg-subtle text-muted cursor-not-allowed ${CONTROL_CLASSES}`}
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
              onChange={(e) => handleCurrencyChange(e.target.value as 'USD' | 'VES')}
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            >
              <option value="USD">USD</option>
              <option value="VES">VES</option>
            </select>
          </div>

          {currency === 'VES' && (
            <div>
              <label htmlFor="invoice-fx-rate" className={LABEL_CLASSES}>
                Tasa BCV Conversión (Bs/USD)
              </label>
              <input
                id="invoice-fx-rate"
                type="number"
                step="0.01"
                min="0.01"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
              />
            </div>
          )}

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
              <option value="CREDIT">Crédito (Pendiente / Cuotas)</option>
              <option value="CASH">Contado (Cobro Inmediato)</option>
            </select>
          </div>

          {paymentCondition === 'CASH' && (
            <div>
              <label htmlFor="invoice-payment-method" className={LABEL_CLASSES}>
                Método de Cobro
              </label>
              <select
                id="invoice-payment-method"
                name="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              >
                {DOCUMENT_PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {paymentCondition === 'CREDIT' && (
            <>
              <div>
                <label htmlFor="invoice-frequency" className={LABEL_CLASSES}>
                  Modalidad de Crédito
                </label>
                <select
                  id="invoice-frequency"
                  name="installmentFrequency"
                  value={installmentFrequency}
                  onChange={(e) =>
                    setInstallmentFrequency(e.target.value as InstallmentFrequencyOption)
                  }
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                >
                  <option value="SINGLE">Pago Único (Al vencimiento)</option>
                  <option value="BIWEEKLY">Cuotas Quincenales (cada 15 días)</option>
                  <option value="MONTHLY">Cuotas Mensuales (cada mes)</option>
                </select>
              </div>

              {installmentFrequency === 'SINGLE' ? (
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
                    value={creditDays}
                    onChange={(e) => setCreditDays(e.target.value)}
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="invoice-installment-count" className={LABEL_CLASSES}>
                    Cantidad de Cuotas
                  </label>
                  <input
                    id="invoice-installment-count"
                    name="installmentCount"
                    type="number"
                    min={2}
                    max={48}
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(e.target.value)}
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {paymentCondition === 'CREDIT' && installmentFrequency !== 'SINGLE' && (
          <div className="rounded-control border border-line bg-canvas p-3 text-xs">
            <div className="mb-2 font-semibold text-ink">
              Cronograma estimado de cuotas (
              {installmentFrequency === 'BIWEEKLY' ? 'Quincenal' : 'Mensual'})
            </div>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {buildInstallmentPreview(
                Number.parseFloat(totals.total) || 0,
                installmentFrequency,
                Number.parseInt(installmentCount, 10) || 1,
                Number.parseInt(creditDays, 10) || 30,
              ).map((item) => (
                <div
                  key={item.number}
                  className="flex items-center justify-between rounded border border-line bg-surface px-2.5 py-1.5"
                >
                  <span className="text-muted">
                    Cuota {item.number} · {item.dueDate.toLocaleDateString()}
                  </span>
                  <span className="font-mono font-semibold text-ink">
                    {item.amount.toFixed(2)} {currency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
                <label className="mb-1 block text-xs font-medium text-muted">Impuesto</label>
                {taxRates.length > 0 ? (
                  <select
                    name="line-tax"
                    required
                    value={line.taxPercentage}
                    onChange={(e) => updateLine(line.key, { taxPercentage: e.target.value })}
                    className={CONTROL_CLASSES}
                  >
                    <option value="" disabled>
                      Seleccionar impuesto...
                    </option>
                    {taxRates.map((tr) => (
                      <option key={tr.id} value={tr.percentage}>
                        {tr.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    name="line-tax"
                    value={line.taxPercentage}
                    onChange={(e) => updateLine(line.key, { taxPercentage: e.target.value })}
                    className={`text-right ${CONTROL_CLASSES}`}
                  />
                )}
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
        <button
          type="submit"
          disabled={pending || !accountingConfigured}
          className={buttonClasses()}
        >
          {pending ? 'Emitiendo...' : 'Emitir Factura de Venta'}
        </button>
      </div>
    </form>
  );
}
