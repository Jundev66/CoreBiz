'use client';

import { useActionState } from 'react';
import { updateProductAccountsAction } from '@/actions/sales';
import type { ActionState } from '@/actions/customers';
import type { AccountApiItem } from '@/api/accounting';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { Card, SectionTitle } from '@/ui/primitives';

const INITIAL: ActionState = { status: 'idle' };

export interface ProductTaxRateOption {
  readonly id: string;
  readonly label: string;
  readonly percentage: string;
}

export function ProductAccountsForm({
  productId,
  accounts,
  revenueAccountId,
  inventoryAccountId,
  trackStock,
  taxRates = [],
  defaultTaxPercentage = '',
  canWrite,
}: {
  readonly productId: string;
  readonly accounts: readonly AccountApiItem[];
  readonly revenueAccountId: string | null;
  readonly inventoryAccountId: string | null;
  readonly trackStock: boolean;
  readonly taxRates?: readonly ProductTaxRateOption[];
  readonly defaultTaxPercentage?: string;
  readonly canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateProductAccountsAction, INITIAL);

  const revenueAccounts = accounts.filter((a) => a.category === 'REVENUE');
  const inventoryAccounts = accounts.filter((a) => a.category === 'ASSET');

  return (
    <section>
      <SectionTitle>Contabilidad e Impuesto del Ítem</SectionTitle>
      <Card className="p-5 sm:p-6">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="productId" value={productId} />

          {state.status === 'success' && (
            <Alert tone="success" role="status">
              Configuración contable y fiscal del ítem actualizada.
            </Alert>
          )}
          {state.status === 'error' && (
            <Alert tone="danger" role="alert">
              No se pudo actualizar la configuración del ítem.
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="item-revenue-account" className={LABEL_CLASSES}>
                Cuenta de Ingresos (Ventas)
              </label>
              <select
                id="item-revenue-account"
                name="revenueAccountId"
                defaultValue={revenueAccountId ?? ''}
                disabled={!canWrite}
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              >
                <option value="">Heredar cuenta por defecto de la empresa</option>
                {(revenueAccounts.length > 0 ? revenueAccounts : accounts).map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} · {acc.name}
                  </option>
                ))}
              </select>
            </div>

            {trackStock && (
              <div>
                <label htmlFor="item-inventory-account" className={LABEL_CLASSES}>
                  Cuenta de Inventario / Activo
                </label>
                <select
                  id="item-inventory-account"
                  name="inventoryAccountId"
                  defaultValue={inventoryAccountId ?? ''}
                  disabled={!canWrite}
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                >
                  <option value="">Heredar cuenta por defecto de la empresa</option>
                  {(inventoryAccounts.length > 0 ? inventoryAccounts : accounts).map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} · {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="item-tax-percentage" className={LABEL_CLASSES}>
                Impuesto del Ítem (Alícuota)
              </label>
              <select
                id="item-tax-percentage"
                name="taxPercentage"
                defaultValue={defaultTaxPercentage}
                disabled={!canWrite}
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              >
                <option value="">Sin impuesto específico (seleccionar en factura)</option>
                <option value="0">Exento (0%)</option>
                {taxRates
                  .filter((tr) => tr.percentage !== '0')
                  .map((tr) => (
                    <option key={tr.id} value={tr.percentage}>
                      {tr.label} ({tr.percentage}%)
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {canWrite && (
            <div className="flex justify-end border-t border-line pt-4">
              <button type="submit" disabled={pending} className={buttonClasses({ size: 'sm' })}>
                {pending ? 'Guardando...' : 'Guardar Configuración del Ítem'}
              </button>
            </div>
          )}
        </form>
      </Card>
    </section>
  );
}
