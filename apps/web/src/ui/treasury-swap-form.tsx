'use client';

import { useActionState, useState } from 'react';
import { DollarSign } from 'lucide-react';
import { executeTreasurySwapAction, type TreasurySwapActionState } from '@/actions/treasury';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { buttonClasses } from '@/ui/button';

const INITIAL: TreasurySwapActionState = { status: 'idle' };

export interface TreasuryAssetAccountOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly usdMinor: string;
  readonly vesMinor: string;
}

export interface TreasuryExpenseAccountOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  IdenticalAccounts: 'La cuenta origen y la cuenta destino deben ser diferentes.',
  InsufficientFunds: 'Fondos insuficientes en la cuenta origen seleccionada para esta moneda.',
  InvalidAmount: 'Los montos deben ser mayores a cero y la comisión no puede superar el origen.',
  InvalidExchangeRate: 'La tasa acordada debe ser mayor a cero.',
  SourceAccountNotFound: 'La cuenta origen seleccionada no existe.',
  TargetAccountNotFound: 'La cuenta destino seleccionada no existe.',
  FeeAccountNotFound: 'La cuenta de comisión seleccionada no existe.',
};

function fmtMinor(minorStr: string): string {
  return (Number(BigInt(minorStr || '0')) / 100).toFixed(2);
}

export function TreasurySwapForm({
  assetAccounts,
  expenseAccounts,
  defaultSourceId,
  defaultTargetId,
  defaultFeeId,
  defaultExchangeRate = 50,
}: {
  readonly assetAccounts: readonly TreasuryAssetAccountOption[];
  readonly expenseAccounts: readonly TreasuryExpenseAccountOption[];
  readonly defaultSourceId: string;
  readonly defaultTargetId: string;
  readonly defaultFeeId: string;
  readonly defaultExchangeRate?: number;
}) {
  const [state, formAction, pending] = useActionState(executeTreasurySwapAction, INITIAL);
  const [sourceId, setSourceId] = useState<string>(defaultSourceId);
  const [targetId, setTargetId] = useState<string>(
    defaultTargetId !== defaultSourceId
      ? defaultTargetId
      : (assetAccounts.find((a) => a.id !== defaultSourceId)?.id ?? defaultTargetId),
  );
  const [sourceCurrency, setSourceCurrency] = useState<'VES' | 'USD'>('VES');
  const [targetCurrency, setTargetCurrency] = useState<'USD' | 'VES'>('USD');
  const [sourceAmount, setSourceAmount] = useState<string>('');
  const [exchangeRate, setExchangeRate] = useState<string>(String(defaultExchangeRate));
  const [feeAmount, setFeeAmount] = useState<string>('0.00');
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [targetManual, setTargetManual] = useState<boolean>(false);

  const selectedSource = assetAccounts.find((a) => a.id === sourceId);
  const availableStr = selectedSource
    ? sourceCurrency === 'USD'
      ? `${fmtMinor(selectedSource.usdMinor)} USD`
      : `${fmtMinor(selectedSource.vesMinor)} VES`
    : '0.00';

  const recomputeTarget = (
    srcAmtStr: string,
    srcCurr: 'VES' | 'USD',
    tgtCurr: 'USD' | 'VES',
    rateStr: string,
    feeStr: string,
  ) => {
    if (targetManual) return;
    const src = Number.parseFloat(srcAmtStr.replace(',', '.'));
    const rate = Number.parseFloat(rateStr.replace(',', '.'));
    const fee = Number.parseFloat(feeStr.replace(',', '.')) || 0;
    if (!Number.isFinite(src) || src <= 0) {
      setTargetAmount('');
      return;
    }
    let grossTarget = src;
    if (srcCurr === 'VES' && tgtCurr === 'USD' && Number.isFinite(rate) && rate > 0) {
      grossTarget = src / rate;
    } else if (srcCurr === 'USD' && tgtCurr === 'VES' && Number.isFinite(rate) && rate > 0) {
      grossTarget = src * rate;
    }
    const net = Math.max(0, grossTarget - fee);
    setTargetAmount(net.toFixed(2));
  };

  const handleSourceChange = (nextId: string) => {
    setSourceId(nextId);
    if (nextId === targetId) {
      const alt = assetAccounts.find((a) => a.id !== nextId);
      if (alt) setTargetId(alt.id);
    }
  };

  const handleTargetChange = (nextId: string) => {
    setTargetId(nextId);
    if (nextId === sourceId) {
      const alt = assetAccounts.find((a) => a.id !== nextId);
      if (alt) setSourceId(alt.id);
    }
  };

  return (
    <form action={formAction} className="space-y-4">
      {state.status === 'error' && state.error && (
        <Alert tone="danger" role="alert">
          {ERROR_MESSAGES[state.error] ?? `No se pudo ejecutar la operación (${state.error}).`}
        </Alert>
      )}

      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-control bg-brand-soft text-brand">
          <DollarSign className="size-4" strokeWidth={2} />
        </span>
        <h2 className="text-base font-semibold text-ink">
          Registrar Swap de Tesorería (Compra de USDT / Divisas)
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="swap-date" className={LABEL_CLASSES}>
            Fecha
          </label>
          <input
            id="swap-date"
            type="date"
            name="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          />
        </div>

        <div>
          <label htmlFor="swap-source-account" className={LABEL_CLASSES}>
            Cuenta Origen (Sale Dinero)
          </label>
          <select
            id="swap-source-account"
            name="sourceAccountId"
            value={sourceId}
            onChange={(e) => handleSourceChange(e.target.value)}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          >
            {assetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name} (${fmtMinor(a.usdMinor)} USD · {fmtMinor(a.vesMinor)} Bs)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="swap-source-currency" className={LABEL_CLASSES}>
            Moneda Origen
          </label>
          <select
            id="swap-source-currency"
            name="sourceCurrency"
            value={sourceCurrency}
            onChange={(e) => {
              const next = e.target.value as 'VES' | 'USD';
              setSourceCurrency(next);
              recomputeTarget(sourceAmount, next, targetCurrency, exchangeRate, feeAmount);
            }}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          >
            <option value="VES">VES (Bolívares)</option>
            <option value="USD">USD (Dólares)</option>
          </select>
        </div>

        <div>
          <label htmlFor="swap-source-amount" className={LABEL_CLASSES}>
            Monto Origen Total
          </label>
          <input
            id="swap-source-amount"
            type="text"
            name="sourceAmount"
            value={sourceAmount}
            onChange={(e) => {
              setSourceAmount(e.target.value);
              recomputeTarget(
                e.target.value,
                sourceCurrency,
                targetCurrency,
                exchangeRate,
                feeAmount,
              );
            }}
            placeholder="Ej: 5000.00"
            className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
            required
          />
          <span className="mt-1 block text-[11px] text-muted">Disponible: {availableStr}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="swap-target-account" className={LABEL_CLASSES}>
            Cuenta Destino (Ingresa Activo)
          </label>
          <select
            id="swap-target-account"
            name="targetAccountId"
            value={targetId}
            onChange={(e) => handleTargetChange(e.target.value)}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          >
            {assetAccounts.map((a) => (
              <option key={a.id} value={a.id} disabled={a.id === sourceId}>
                {a.code} - {a.name} (${fmtMinor(a.usdMinor)} USD · {fmtMinor(a.vesMinor)} Bs)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="swap-target-currency" className={LABEL_CLASSES}>
            Moneda Destino
          </label>
          <select
            id="swap-target-currency"
            name="targetCurrency"
            value={targetCurrency}
            onChange={(e) => {
              const next = e.target.value as 'USD' | 'VES';
              setTargetCurrency(next);
              recomputeTarget(sourceAmount, sourceCurrency, next, exchangeRate, feeAmount);
            }}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          >
            <option value="USD">USD / USDT</option>
            <option value="VES">VES</option>
          </select>
        </div>

        <div>
          <label htmlFor="swap-target-amount" className={LABEL_CLASSES}>
            Monto Destino Recibido
          </label>
          <input
            id="swap-target-amount"
            type="text"
            name="targetAmount"
            value={targetAmount}
            onChange={(e) => {
              setTargetManual(true);
              setTargetAmount(e.target.value);
            }}
            placeholder="Ej: 100.00"
            className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
            required
          />
        </div>

        <div>
          <label htmlFor="swap-exchange-rate" className={LABEL_CLASSES}>
            Tasa Acordada (VES/USD)
          </label>
          <input
            id="swap-exchange-rate"
            type="text"
            name="exchangeRate"
            value={exchangeRate}
            onChange={(e) => {
              setExchangeRate(e.target.value);
              recomputeTarget(
                sourceAmount,
                sourceCurrency,
                targetCurrency,
                e.target.value,
                feeAmount,
              );
            }}
            placeholder="Ej: 50.00"
            className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="swap-fee-account" className={LABEL_CLASSES}>
            Cuenta de Comisión / Gas Fee
          </label>
          <select
            id="swap-fee-account"
            name="feeAccountId"
            defaultValue={defaultFeeId}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          >
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="swap-fee-amount" className={LABEL_CLASSES}>
            Monto Comisión (Moneda Destino)
          </label>
          <input
            id="swap-fee-amount"
            type="text"
            name="feeAmount"
            value={feeAmount}
            onChange={(e) => {
              setFeeAmount(e.target.value);
              recomputeTarget(
                sourceAmount,
                sourceCurrency,
                targetCurrency,
                exchangeRate,
                e.target.value,
              );
            }}
            placeholder="Ej: 0.00"
            className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
          />
        </div>

        <div>
          <label htmlFor="swap-reference" className={LABEL_CLASSES}>
            Referencia Externa (P2P / Hash TX)
          </label>
          <input
            id="swap-reference"
            type="text"
            name="counterpartyReference"
            placeholder="Ej: BINANCE-P2P-12345"
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="swap-description" className={LABEL_CLASSES}>
          Concepto / Notas
        </label>
        <input
          id="swap-description"
          type="text"
          name="description"
          placeholder="Ej: Compra de liquidez USDT en Binance P2P para pago a proveedor"
          className={`mt-1.5 ${CONTROL_CLASSES}`}
        />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={buttonClasses({ size: 'md' })}>
          {pending ? 'Ejecutando...' : 'Ejecutar Operación de Tesorería'}
        </button>
      </div>
    </form>
  );
}
