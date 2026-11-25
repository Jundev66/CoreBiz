'use client';

import { useActionState, useState } from 'react';
import { applyInvoicePaymentAction, type InvoiceFormState } from '@/actions/invoicing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';

const INITIAL: InvoiceFormState = { status: 'idle' };

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
}) {
  const [state, formAction, pending] = useActionState(applyInvoicePaymentAction, INITIAL);
  const [amount, setAmount] = useState<string>(remainingDecimal);
  const [issueExchangeRate, setIssueExchangeRate] = useState<string>('');
  const [paymentExchangeRate, setPaymentExchangeRate] = useState<string>('');

  const amountNum = Number.parseFloat(amount.replace(',', '.')) || 0;
  const remainingNum = Number.parseFloat(remainingDecimal.replace(',', '.')) || 0;
  const newRemaining = Math.max(0, remainingNum - amountNum);

  const issueRateNum = Number.parseFloat(issueExchangeRate.replace(',', '.')) || 0;
  const paymentRateNum = Number.parseFloat(paymentExchangeRate.replace(',', '.')) || 0;
  const fxDelta =
    issueRateNum > 0 && paymentRateNum > 0 && amountNum > 0
      ? amountNum * (paymentRateNum - issueRateNum)
      : 0;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="cashAccountId" value={cashAccountId} />
      <input type="hidden" name="receivableAccountId" value={receivableAccountId} />

      {state.status === 'error' && (
        <Alert tone="danger" role="alert">
          No se pudo registrar el cobro. Verifica que el monto no exceda el saldo pendiente.
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
          <div>
            <label htmlFor="collect-amount" className={LABEL_CLASSES}>
              Monto a Cobrar ({currency})
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

          <div>
            <label htmlFor="collect-ref" className={LABEL_CLASSES}>
              Referencia de Cobro (opcional)
            </label>
            <input
              id="collect-ref"
              name="reference"
              type="text"
              placeholder="TRF-00123 / Pago Móvil"
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            />
          </div>

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
                  placeholder="55.00"
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
          <div className="flex items-center justify-between font-semibold text-ink">
            <span>Nuevo Saldo Restante tras Abono:</span>
            <span className="font-mono">
              {newRemaining.toFixed(2)} {currency}
            </span>
          </div>
          {paymentRateNum > 0 && amountNum > 0 && (
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Cobro Equivalente a Tasa del Día:</span>
              <span className="font-mono">
                {(amountNum * paymentRateNum).toFixed(2)} {fiscalCurrency}
              </span>
            </div>
          )}
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
