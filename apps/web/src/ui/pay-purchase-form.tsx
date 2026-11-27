'use client';

import { useActionState, useState } from 'react';
import { payGoodsReceiptAction, type PurchasingState } from '@/actions/purchasing';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';

const INITIAL: PurchasingState = { status: 'idle' };

export interface AssetAccountOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export function PayPurchaseForm({
  goodsReceiptId,
  receiptNumber,
  supplierName,
  currency,
  totalFormatted,
  paidFormatted,
  remainingDecimal,
  assetAccounts,
}: {
  readonly goodsReceiptId: string;
  readonly receiptNumber: string;
  readonly supplierName: string;
  readonly currency: string;
  readonly totalFormatted: string;
  readonly paidFormatted: string;
  readonly remainingDecimal: string;
  readonly assetAccounts: readonly AssetAccountOption[];
}) {
  const [state, formAction, pending] = useActionState(payGoodsReceiptAction, INITIAL);
  const [amount, setAmount] = useState<string>(remainingDecimal);

  const amountNum = Number.parseFloat(amount.replace(',', '.')) || 0;
  const remainingNum = Number.parseFloat(remainingDecimal.replace(',', '.')) || 0;
  const newRemaining = Math.max(0, remainingNum - amountNum);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="goodsReceiptId" value={goodsReceiptId} />
      <input type="hidden" name="currency" value={currency} />

      {state.status === 'error' && (
        <Alert tone="danger" role="alert">
          No se pudo registrar el pago al proveedor. Verificá el monto y la cuenta de activo
          seleccionada.
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
          <div>
            <label htmlFor="pay-amount" className={LABEL_CLASSES}>
              Monto a Pagar ({currency})
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
            <span className="mt-1 block text-xs text-muted">
              Saldo tras pago: {newRemaining.toFixed(2)} {currency}
            </span>
          </div>

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

          <div>
            <label htmlFor="pay-reference" className={LABEL_CLASSES}>
              Referencia / Hash / Comprobante
            </label>
            <input
              id="pay-reference"
              name="reference"
              type="text"
              placeholder="TRF-001 / TXID USDT"
              className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
            />
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
