'use client';

import { useActionState, useState } from 'react';
import { ArrowRightLeft, DollarSign } from 'lucide-react';
import { executeTreasurySwapAction, type TreasurySwapActionState } from '@/actions/treasury';
import { Alert, Badge } from '@/ui/feedback';
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
  InsufficientFunds:
    'Fondos insuficientes en la cuenta origen seleccionada para cubrir el monto en VES.',
  InvalidAmount:
    'Los montos deben ser mayores a cero y la comisión no puede superar el monto de la operación.',
  InvalidExchangeRate: 'La tasa acordada debe ser mayor a cero.',
  SourceAccountNotFound: 'La cuenta origen seleccionada no existe.',
  TargetAccountNotFound: 'La cuenta destino seleccionada no existe.',
  FeeAccountNotFound: 'La cuenta de comisión seleccionada no existe.',
};

function fmtMinor(minorStr: string): string {
  return (Number(BigInt(minorStr || '0')) / 100).toFixed(2);
}

export function TreasurySwapForm({
  sourceAccounts,
  targetAccounts,
  expenseAccounts,
  defaultSourceId,
  defaultTargetId,
  defaultFeeId,
  defaultExchangeRate = 50,
}: {
  readonly sourceAccounts: readonly TreasuryAssetAccountOption[];
  readonly targetAccounts: readonly TreasuryAssetAccountOption[];
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
      : (targetAccounts.find((a) => a.id !== defaultSourceId)?.id ?? defaultTargetId),
  );
  const [sourceAmount, setSourceAmount] = useState<string>('');
  const [exchangeRate, setExchangeRate] = useState<string>(String(defaultExchangeRate));
  const [feeAmount, setFeeAmount] = useState<string>('0.00');
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [targetManual, setTargetManual] = useState<boolean>(false);

  const selectedSource = sourceAccounts.find((a) => a.id === sourceId);
  const availableVesStr = selectedSource ? fmtMinor(selectedSource.vesMinor) : '0.00';

  const recomputeTarget = (srcAmtStr: string, rateStr: string, feeStr: string) => {
    if (targetManual) return;
    const src = Number.parseFloat(srcAmtStr.replace(',', '.'));
    const rate = Number.parseFloat(rateStr.replace(',', '.'));
    const fee = Number.parseFloat(feeStr.replace(',', '.')) || 0;
    if (!Number.isFinite(src) || src <= 0 || !Number.isFinite(rate) || rate <= 0) {
      setTargetAmount('');
      return;
    }
    const grossUsd = src / rate;
    const netUsd = Math.max(0, grossUsd - fee);
    setTargetAmount(netUsd.toFixed(2));
  };

  const handleSourceChange = (nextId: string) => {
    setSourceId(nextId);
    if (nextId === targetId) {
      const alt = targetAccounts.find((a) => a.id !== nextId);
      if (alt) setTargetId(alt.id);
    }
  };

  const handleTargetChange = (nextId: string) => {
    setTargetId(nextId);
    if (nextId === sourceId) {
      const alt = sourceAccounts.find((a) => a.id !== nextId);
      if (alt) setSourceId(alt.id);
    }
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="sourceCurrency" value="VES" />
      <input type="hidden" name="targetCurrency" value="USD" />

      {state.status === 'error' && state.error && (
        <Alert tone="danger" role="alert">
          {ERROR_MESSAGES[state.error] ?? `No se pudo ejecutar la operación (${state.error}).`}
        </Alert>
      )}

      {state.status === 'success' && state.message && (
        <Alert tone="success" role="alert">
          {state.message}
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-control bg-brand-soft text-brand">
            <DollarSign className="size-4" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">
              Swap de Tesorería: Compra de USDT / Divisas
            </h2>
            <p className="text-xs text-muted">
              Liquidación de fondos en Bolívares (VES) para adquisición de criptoactivos o dólares
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="warn">Origen: VES</Badge>
          <ArrowRightLeft className="size-3.5 text-muted" />
          <Badge tone="success">Destino: USD / USDT</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="swap-date" className={LABEL_CLASSES}>
            Fecha de Operación
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
            Cuenta Origen (Sale Dinero VES)
          </label>
          <select
            id="swap-source-account"
            name="sourceAccountId"
            value={sourceId}
            onChange={(e) => handleSourceChange(e.target.value)}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          >
            {sourceAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name} (Disp: {fmtMinor(a.vesMinor)} VES)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="swap-source-amount" className={LABEL_CLASSES}>
            Monto a Convertir (VES)
          </label>
          <input
            id="swap-source-amount"
            type="text"
            name="sourceAmount"
            value={sourceAmount}
            onChange={(e) => {
              setSourceAmount(e.target.value);
              recomputeTarget(e.target.value, exchangeRate, feeAmount);
            }}
            placeholder="Ej: 50000.00"
            className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
            required
          />
          <span className="mt-1 block text-[11px] text-muted">
            Saldo disponible: {availableVesStr} VES
          </span>
        </div>

        <div>
          <label htmlFor="swap-exchange-rate" className={LABEL_CLASSES}>
            Tasa Acordada (VES por USD)
          </label>
          <input
            id="swap-exchange-rate"
            type="text"
            name="exchangeRate"
            value={exchangeRate}
            onChange={(e) => {
              setExchangeRate(e.target.value);
              recomputeTarget(sourceAmount, e.target.value, feeAmount);
            }}
            placeholder="Ej: 50.00"
            className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="swap-target-account" className={LABEL_CLASSES}>
            Cuenta Destino (Ingresa Activo USD/USDT)
          </label>
          <select
            id="swap-target-account"
            name="targetAccountId"
            value={targetId}
            onChange={(e) => handleTargetChange(e.target.value)}
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          >
            {targetAccounts.map((a) => (
              <option key={a.id} value={a.id} disabled={a.id === sourceId}>
                {a.code} - {a.name} (Saldo: ${fmtMinor(a.usdMinor)} USD)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="swap-target-amount" className={LABEL_CLASSES}>
            Monto Recibido Neto (USD / USDT)
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
            placeholder="Ej: 1000.00"
            className={`mt-1.5 font-mono tabular-nums font-semibold text-ok ${CONTROL_CLASSES}`}
            required
          />
          <span className="mt-1 block text-[11px] text-muted">
            Calculado automáticamente según tasa y comisión
          </span>
        </div>

        <div>
          <label htmlFor="swap-fee-account" className={LABEL_CLASSES}>
            Cuenta Comisión / Gas Fee
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
            Comisión P2P / Red (USD)
          </label>
          <input
            id="swap-fee-amount"
            type="text"
            name="feeAmount"
            value={feeAmount}
            onChange={(e) => {
              setFeeAmount(e.target.value);
              recomputeTarget(sourceAmount, exchangeRate, e.target.value);
            }}
            placeholder="Ej: 0.00"
            className={`mt-1.5 font-mono tabular-nums ${CONTROL_CLASSES}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="swap-reference" className={LABEL_CLASSES}>
            Referencia de Operación (N° Transferencia / Orden P2P / Hash)
          </label>
          <input
            id="swap-reference"
            type="text"
            name="counterpartyReference"
            placeholder="Ej: BINANCE-P2P-20261128-091"
            className={`mt-1.5 ${CONTROL_CLASSES}`}
            required
          />
        </div>

        <div>
          <label htmlFor="swap-description" className={LABEL_CLASSES}>
            Concepto Contable
          </label>
          <input
            id="swap-description"
            type="text"
            name="description"
            placeholder="Ej: Adquisición de USDT vía P2P para liquidación de compromisos"
            className={`mt-1.5 ${CONTROL_CLASSES}`}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button type="submit" disabled={pending} className={buttonClasses({ size: 'md' })}>
          {pending ? 'Ejecutando...' : 'Ejecutar Swap de Tesorería'}
        </button>
      </div>
    </form>
  );
}
