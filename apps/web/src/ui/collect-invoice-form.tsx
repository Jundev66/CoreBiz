'use client';

import { useActionState, useState } from 'react';
import { applyInvoicePaymentAction, type InvoiceFormState } from '@/actions/invoicing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';
import { convertCurrencyAmount, DOCUMENT_PAYMENT_METHODS } from '@/ui/payment-methods';

const INITIAL: InvoiceFormState = { status: 'idle' };

export interface CollectAssetAccountOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface CollectInstallmentOption {
  readonly id: string;
  readonly installmentNumber: number;
  readonly dueDate: string;
  readonly currency: string;
  readonly amountMinor: string;
  readonly paidMinor: string;
  readonly status: string;
}

function minorToNumber(raw: string): number {
  return Number(BigInt(raw || '0')) / 100;
}

export function CollectInvoiceForm({
  invoiceId,
  documentNumber,
  currency,
  totalFormatted,
  paidFormatted,
  remainingDecimal,
  cashAccountId,
  receivableAccountId,
  fiscalCurrency,
  defaultExchangeRate = 50,
  assetAccounts = [],
  installments = [],
}: {
  readonly invoiceId: string;
  readonly documentNumber: string;
  readonly currency: string;
  readonly totalFormatted: string;
  readonly paidFormatted: string;
  readonly remainingDecimal: string;
  readonly cashAccountId: string;
  readonly receivableAccountId: string;
  readonly fiscalCurrency: string;
  readonly defaultExchangeRate?: number;
  readonly assetAccounts?: readonly CollectAssetAccountOption[];
  readonly installments?: readonly CollectInstallmentOption[];
}) {
  const [state, formAction, pending] = useActionState(applyInvoicePaymentAction, INITIAL);
  const openInstallments = installments.filter((i) => i.status !== 'PAID');
  const firstOpen = openInstallments[0];
  const initialAmount = firstOpen
    ? (minorToNumber(firstOpen.amountMinor) - minorToNumber(firstOpen.paidMinor)).toFixed(2)
    : remainingDecimal;

  const [paymentCurrency, setPaymentCurrency] = useState<'USD' | 'VES'>(
    currency === 'VES' ? 'VES' : 'USD',
  );
  const [exchangeRate, setExchangeRate] = useState<string>(String(defaultExchangeRate));
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string>(firstOpen?.id ?? '');
  const [paymentMethod, setPaymentMethod] = useState<string>(
    currency === 'VES' ? 'MOBILE_PAY' : 'ZELLE',
  );
  const [amount, setAmount] = useState<string>(initialAmount);
  const [issueExchangeRate, setIssueExchangeRate] = useState<string>(String(defaultExchangeRate));
  const [paymentExchangeRate, setPaymentExchangeRate] = useState<string>(
    String(defaultExchangeRate),
  );

  const activeRate = Number.parseFloat(exchangeRate.replace(',', '.')) || defaultExchangeRate || 50;
  const amountNum = Number.parseFloat(amount.replace(',', '.')) || 0;
  const appliedInDocCurrency = convertCurrencyAmount(
    amountNum,
    paymentCurrency,
    currency,
    activeRate,
  );
  const remainingNum = Number.parseFloat(remainingDecimal.replace(',', '.')) || 0;
  const newRemaining = Math.max(0, remainingNum - appliedInDocCurrency);

  const issueRateNum = Number.parseFloat(issueExchangeRate.replace(',', '.')) || 0;
  const paymentRateNum = Number.parseFloat(paymentExchangeRate.replace(',', '.')) || 0;
  const fxDelta =
    issueRateNum > 0 && paymentRateNum > 0 && appliedInDocCurrency > 0
      ? appliedInDocCurrency * (paymentRateNum - issueRateNum)
      : 0;

  const handlePaymentCurrencyChange = (nextCurr: 'USD' | 'VES') => {
    if (nextCurr === paymentCurrency) return;
    if (amountNum > 0) {
      const converted = convertCurrencyAmount(amountNum, paymentCurrency, nextCurr, activeRate);
      setAmount(converted.toFixed(2));
    }
    setPaymentCurrency(nextCurr);
    if (nextCurr === 'VES' && (paymentMethod === 'ZELLE' || paymentMethod === 'CASH_USD')) {
      setPaymentMethod('MOBILE_PAY');
    } else if (
      nextCurr === 'USD' &&
      (paymentMethod === 'MOBILE_PAY' || paymentMethod === 'CASH_VES')
    ) {
      setPaymentMethod('ZELLE');
    }
  };

  const handleInstallmentChange = (instId: string) => {
    setSelectedInstallmentId(instId);
    const found = openInstallments.find((i) => i.id === instId);
    const baseInDoc = found
      ? Math.max(0, minorToNumber(found.amountMinor) - minorToNumber(found.paidMinor))
      : remainingNum;
    const inPaymentCurrency = convertCurrencyAmount(
      baseInDoc,
      currency,
      paymentCurrency,
      activeRate,
    );
    setAmount(inPaymentCurrency.toFixed(2));
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {assetAccounts.length === 0 && (
        <input type="hidden" name="cashAccountId" value={cashAccountId} />
      )}
      <input type="hidden" name="receivableAccountId" value={receivableAccountId} />

      {state.status === 'error' && (
        <Alert tone="danger" role="alert">
          No se pudo registrar el cobro. Verificá que el monto equivalente no exceda el saldo
          pendiente.
        </Alert>
      )}

      <Card className="p-5 sm:p-6 space-y-5">
        <div className="grid gap-4 rounded-control border border-line bg-canvas p-4 sm:grid-cols-3 text-sm">
          <div>
            <span className="text-xs text-muted block">Factura</span>
            <span className="font-mono font-bold text-ink">{documentNumber}</span>
          </div>
          <div>
            <span className="text-xs text-muted block">Total Factura</span>
            <span className="font-mono font-semibold text-ink">{totalFormatted}</span>
          </div>
          <div>
            <span className="text-xs text-muted block">Cobrado Previo</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              {paidFormatted}
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {openInstallments.length > 0 && (
            <div className="sm:col-span-2">
              <label htmlFor="collect-installment" className={LABEL_CLASSES}>
                Cuota a Cobrar
              </label>
              <select
                id="collect-installment"
                name="installmentId"
                value={selectedInstallmentId}
                onChange={(e) => handleInstallmentChange(e.target.value)}
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              >
                {openInstallments.map((inst) => {
                  const left = minorToNumber(inst.amountMinor) - minorToNumber(inst.paidMinor);
                  return (
                    <option key={inst.id} value={inst.id}>
                      Cuota #{inst.installmentNumber} · Vence{' '}
                      {new Date(inst.dueDate).toLocaleDateString()} · Pendiente {left.toFixed(2)}{' '}
                      {inst.currency}
                    </option>
                  );
                })}
                <option value="">
                  Abono libre al saldo total ({remainingDecimal} {currency})
                </option>
              </select>
            </div>
          )}

          <div>
            <label htmlFor="collect-payment-currency" className={LABEL_CLASSES}>
              Moneda del Cobro
            </label>
            <select
              id="collect-payment-currency"
              name="currency"
              value={paymentCurrency}
              onChange={(e) => handlePaymentCurrencyChange(e.target.value as 'USD' | 'VES')}
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            >
              <option value="USD">USD (Dólares)</option>
              <option value="VES">VES (Bolívares)</option>
            </select>
          </div>

          <div>
            <label htmlFor="collect-method" className={LABEL_CLASSES}>
              Método de Cobro
            </label>
            <select
              id="collect-method"
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

          <div>
            <label htmlFor="collect-amount" className={LABEL_CLASSES}>
              Monto Recibido ({paymentCurrency})
            </label>
            <input
              id="collect-amount"
              name="amount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
            />
          </div>

          {paymentCurrency !== currency ? (
            <div>
              <label htmlFor="collect-fx-rate" className={LABEL_CLASSES}>
                Tasa de Conversión del Día (Bs/USD)
              </label>
              <input
                id="collect-fx-rate"
                name="exchangeRate"
                inputMode="decimal"
                required
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
              />
            </div>
          ) : (
            <input type="hidden" name="exchangeRate" value="1" />
          )}

          <div>
            <label htmlFor="collect-ref" className={LABEL_CLASSES}>
              Referencia de Cobro (opcional)
            </label>
            <input
              id="collect-ref"
              name="reference"
              type="text"
              placeholder="TRF-00123 / Pago Móvil / Zelle"
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            />
          </div>

          {assetAccounts.length > 0 && (
            <div className={paymentCurrency !== currency ? '' : 'sm:col-span-2'}>
              <label htmlFor="collect-account" className={LABEL_CLASSES}>
                Cuenta Destino (Caja / Banco / USD / USDT)
              </label>
              <select
                id="collect-account"
                name="cashAccountId"
                required
                defaultValue={cashAccountId}
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              >
                {assetAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} · {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {currency !== fiscalCurrency && (
            <>
              <div>
                <label htmlFor="collect-issue-rate" className={LABEL_CLASSES}>
                  Tasa BCV Emisión ({fiscalCurrency})
                </label>
                <input
                  id="collect-issue-rate"
                  name="issueExchangeRate"
                  inputMode="decimal"
                  value={issueExchangeRate}
                  onChange={(e) => setIssueExchangeRate(e.target.value)}
                  placeholder="50.00"
                  className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
                />
              </div>

              <div>
                <label htmlFor="collect-payment-rate" className={LABEL_CLASSES}>
                  Tasa BCV Día del Cobro ({fiscalCurrency})
                </label>
                <input
                  id="collect-payment-rate"
                  name="paymentExchangeRate"
                  inputMode="decimal"
                  value={paymentExchangeRate}
                  onChange={(e) => setPaymentExchangeRate(e.target.value)}
                  placeholder="50.00"
                  className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
                />
              </div>
            </>
          )}
        </div>

        <div className="space-y-1.5 rounded-control border border-line bg-canvas p-4 text-sm tabular-nums">
          <div className="flex items-center justify-between text-muted">
            <span>Saldo Pendiente Actual:</span>
            <span className="font-mono">
              {remainingDecimal} {currency}
            </span>
          </div>
          {paymentCurrency !== currency && (
            <div className="flex items-center justify-between text-brand">
              <span>Equivalente Aplicado a la Factura ({currency}):</span>
              <span className="font-mono font-semibold">
                {appliedInDocCurrency.toFixed(2)} {currency}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between font-semibold text-ink">
            <span>Nuevo Saldo Restante tras Abono:</span>
            <span className="font-mono">
              {newRemaining.toFixed(2)} {currency}
            </span>
          </div>
          {fxDelta !== 0 && (
            <div className="flex items-center justify-between border-t border-line pt-1.5 text-xs font-semibold text-brand">
              <span>Diferencial Cambiario Realizado:</span>
              <span className="font-mono">
                {fxDelta > 0 ? '+' : ''}
                {fxDelta.toFixed(2)} {fiscalCurrency}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={pending} className={buttonClasses({ size: 'lg' })}>
            {pending ? 'Registrando...' : 'Registrar Cobro'}
          </button>
        </div>
      </Card>
    </form>
  );
}
