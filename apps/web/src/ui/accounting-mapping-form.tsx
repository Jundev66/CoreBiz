'use client';

import { useActionState } from 'react';
import { saveCompanyAccountMappingAction, type AccountActionState } from '@/actions/accounting';
import type { AccountApiItem } from '@/api/accounting';
import type { CompanyAccountMapping } from '@/api/accounting-mapping';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';
import {
  filterInventoryAccounts,
  filterLiquidAssetAccounts,
  filterReceivableAccounts,
} from '@/ui/account-filters';

const INITIAL: AccountActionState = { status: 'idle' };

interface FlowField {
  readonly name: keyof CompanyAccountMapping;
  readonly label: string;
  readonly hint: string;
  readonly categories: readonly string[];
}

const SALES_FLOW_FIELDS: readonly FlowField[] = [
  {
    name: 'cashAccountId',
    label: 'Caja y Bancos (Contado / Cobros)',
    hint: 'Cuenta debitada en ventas de contado y cobros de clientes.',
    categories: ['ASSET'],
  },
  {
    name: 'receivableAccountId',
    label: 'Cuentas por Cobrar (Crédito)',
    hint: 'Cuenta debitada al emitir facturas de venta a crédito.',
    categories: ['ASSET'],
  },
  {
    name: 'revenueAccountId',
    label: 'Ingresos por Ventas (Default)',
    hint: 'Se usa si el ítem no tiene una cuenta de ingresos propia.',
    categories: ['REVENUE'],
  },
  {
    name: 'taxPayableAccountId',
    label: 'Débito Fiscal IVA / Sales Tax por Pagar',
    hint: 'Cuenta de pasivo donde se acumula el impuesto facturado.',
    categories: ['LIABILITY'],
  },
];

const PURCHASING_FLOW_FIELDS: readonly FlowField[] = [
  {
    name: 'inventoryAccountId',
    label: 'Inventario de Mercancías (Default)',
    hint: 'Se usa al registrar compras o movimientos si el ítem no define cuenta propia.',
    categories: ['ASSET'],
  },
  {
    name: 'payableAccountId',
    label: 'Cuentas por Pagar (Proveedores)',
    hint: 'Cuenta acreditada en facturas de compra a crédito.',
    categories: ['LIABILITY'],
  },
  {
    name: 'taxCreditAccountId',
    label: 'Crédito Fiscal IVA (Compras)',
    hint: 'Cuenta debitada por el IVA soportado en facturas de compra.',
    categories: ['ASSET', 'LIABILITY'],
  },
  {
    name: 'cogsAccountId',
    label: 'Costo de Ventas',
    hint: 'Cuenta de costo asociada a la salida de inventario.',
    categories: ['COGS', 'EXPENSE'],
  },
];

export function AccountingMappingForm({
  accounts,
  defaults,
  canWrite,
}: {
  readonly accounts: readonly AccountApiItem[];
  readonly defaults: CompanyAccountMapping;
  readonly canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveCompanyAccountMappingAction, INITIAL);

  const renderField = (field: FlowField) => {
    const filtered =
      field.name === 'cashAccountId'
        ? filterLiquidAssetAccounts(accounts)
        : field.name === 'receivableAccountId'
          ? filterReceivableAccounts(accounts)
          : field.name === 'inventoryAccountId'
            ? filterInventoryAccounts(accounts)
            : accounts.filter((a) => field.categories.includes(a.category));
    const options = filtered.length > 0 ? filtered : accounts;

    return (
      <div key={field.name}>
        <label htmlFor={`map-${field.name}`} className={LABEL_CLASSES}>
          {field.label}
        </label>
        <select
          id={`map-${field.name}`}
          name={field.name}
          defaultValue={defaults[field.name]}
          disabled={!canWrite}
          className={`mt-1.5 ${CONTROL_CLASSES}`}
        >
          {options.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.code} · {acc.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">{field.hint}</p>
      </div>
    );
  };

  return (
    <form action={formAction} className="space-y-6">
      {state.status === 'success' && (
        <Alert tone="success" role="status">
          Configuración contable por flujo guardada correctamente.
        </Alert>
      )}
      {state.status === 'error' && (
        <Alert tone="danger" role="alert">
          No se pudo guardar la configuración de cuentas. Verificá los campos seleccionados.
        </Alert>
      )}

      <Card className="p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Flujo de Ventas & Cobros</h3>
          <p className="text-xs text-muted">
            Cuentas que se disparan al emitir facturas de venta, POS y registrar abonos.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">{SALES_FLOW_FIELDS.map(renderField)}</div>
      </Card>

      <Card className="p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Flujo de Compras & Inventario</h3>
          <p className="text-xs text-muted">
            Cuentas que se disparan al registrar facturas de compra, CxP e ingreso de stock.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">{PURCHASING_FLOW_FIELDS.map(renderField)}</div>
      </Card>

      {canWrite && (
        <div className="flex justify-end">
          <button type="submit" disabled={pending} className={buttonClasses({ size: 'lg' })}>
            {pending ? 'Guardando...' : 'Guardar Cuentas por Flujo'}
          </button>
        </div>
      )}
    </form>
  );
}
