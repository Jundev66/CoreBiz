'use client';

import { useActionState, useState } from 'react';
import { payGoodsReceiptAction, type PurchasingState } from '@/actions/purchasing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';
import { convertCurrencyAmount, DOCUMENT_PAYMENT_METHODS } from '@/ui/payment-methods';

const INITIAL: PurchasingState = { status: 'idle' };

export interface AssetAccountOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface PurchaseInstallmentOption {
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

export function PayPurchaseForm({
  goodsReceiptId,
  receiptNumber,
  supplierName,
  currency,
  defaultExchangeRate = 50,
  totalFormatted,
  paidFormatted,
  remainingDecimal,
  assetAccounts,
  installments = [],
}: {
  readonly goodsReceiptId: string;
  readonly receiptNumber: string;
  readonly supplierName: string;
  readonly currency: string;
  readonly defaultExchangeRate?: number;
  readonly totalFormatted: string;
  readonly paidFormatted: string;
  readonly remainingDecimal: string;
  readonly assetAccounts: readonly AssetAccountOption[];
  readonly installments?: readonly PurchaseInstallmentOption[];
}) {
  const [state, formAction, pending] = useActionState(payGoodsReceiptAction, INITIAL);
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
    currency === 'VES' ? 'BANK_TRANSFER' : 'ZELLE',
  );
  const [amount, setAmount] = useState<string>(initialAmount);

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

  const handlePaymentCurrencyChange = (nextCurr: 'USD' | 'VES') => {
    if (nextCurr === paymentCurrency) return;
    if (amountNum > 0) {
      const converted = convertCurrencyAmount(amountNum, paymentCurrency, nextCurr, activeRate);
      setAmount(converted.toFixed(2));
    }
    setPaymentCurrency(nextCurr);
    if (nextCurr === 'VES' && (paymentMethod === 'ZELLE' || paymentMethod === 'CASH_USD')) {
      setPaymentMethod('BANK_TRANSFER');
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
      <input type="hidden" name="goodsReceiptId" value={goodsReceiptId} />

      {state.status === 'error' && (
        <Alert tone="danger" role="alert">
          No se pudo registrar el pago al proveedor. Verificá el monto, la tasa y la cuenta de
          activo seleccionada.
        </Alert>
      )}

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 rounded-control border border-line bg-canvas p-4 text-sm sm:grid-cols-4">
          <div>
            <span className="block text-xs text-muted">Compra</span>
            <span className="font-mono font-bold text-ink">{receiptNumber}</span>
          </div>
          <div>
            <span className="block text-xs text-muted">Proveedor</span>
            <span className="font-semibold text-ink">{supplierName}</span>
          </div>
          <div>
            <span className="block text-xs text-muted">Total Compra</span>
            <span className="font-mono font-semibold text-ink">{totalFormatted}</span>
          </div>
          <div>
            <span className="block text-xs text-muted">Pagado Previo</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              {paidFormatted}
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {openInstallments.length > 0 && (
            <div className="sm:col-span-2">
              <label htmlFor="pay-installment" className={LABEL_CLASSES}>
                Cuota a Pagar
              </label>
              <select
                id="pay-installment"
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
                      {new Date(inst.dueDate).toLocaleDateString('es-VE', { timeZone: 'UTC' })} ·
                      Pendiente {left.toFixed(2)} {inst.currency}
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
            <label htmlFor="pay-currency" className={LABEL_CLASSES}>
              Moneda del Pago
            </label>
            <select
              id="pay-currency"
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
            <label htmlFor="pay-method" className={LABEL_CLASSES}>
              Método de Pago
            </label>
            <select
              id="pay-method"
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
            <label htmlFor="pay-amount" className={LABEL_CLASSES}>
              Monto a Pagar ({paymentCurrency})
            </label>
            <input
              id="pay-amount"
              name="amount"
              type="text"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
            />
          </div>

          {paymentCurrency !== currency ? (
            <div>
              <label htmlFor="pay-fx-rate" className={LABEL_CLASSES}>
                Tasa de Conversión del Día (Bs/USD)
              </label>
              <input
                id="pay-fx-rate"
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
            <label htmlFor="pay-source-account" className={LABEL_CLASSES}>
              Cuenta de Activo Origen (Caja / Banco / USD / USDT)
            </label>
            <select
              id="pay-source-account"
              name="sourceAccountId"
              required
              defaultValue={assetAccounts[0]?.id ?? ''}
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            >
              {assetAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} · {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pay-date" className={LABEL_CLASSES}>
              Fecha de Pago
            </label>
            <input
              id="pay-date"
              name="paymentDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="pay-reference" className={LABEL_CLASSES}>
              Referencia / Hash / Comprobante
            </label>
            <input
              id="pay-reference"
              name="reference"
              type="text"
              placeholder="TRF-001 / TXID USDT / Zelle"
              className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
            />
          </div>
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
              <span>Equivalente Aplicado a la Compra ({currency}):</span>
              <span className="font-mono font-semibold">
                {appliedInDocCurrency.toFixed(2)} {currency}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between font-semibold text-ink">
            <span>Nuevo Saldo Restante tras Pago:</span>
            <span className="font-mono">
              {newRemaining.toFixed(2)} {currency}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || assetAccounts.length === 0}
            className={buttonClasses({ size: 'md' })}
          >
            {pending ? 'Registrando pago...' : 'Registrar Pago a Proveedor'}
          </button>
        </div>
      </Card>
    </form>
  );
}
