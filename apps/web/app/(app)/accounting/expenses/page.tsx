import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { listDisbursements } from '@/api/disbursements';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Alert, Badge } from '@/ui/feedback';
import { Card, SectionTitle, Stat } from '@/ui/primitives';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { buttonClasses } from '@/ui/button';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, DollarSign, ReceiptText, ShieldCheck, Truck } from 'lucide-react';
import { recordDisbursementAction } from '@/actions/disbursements';
import { filterLiquidAssetAccounts } from '@/ui/account-filters';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { ctx } = await apiForRequest();
  const { error: errorKind } = await searchParams;

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Gastos Operativos & Logística">
        <NoAccess />
      </Screen>
    );
  }

  const [disbursements, accounts] = await Promise.all([
    listDisbursements().catch(() => []),
    listAccounts().catch(() => []),
  ]);

  const assetAccounts = filterLiquidAssetAccounts(accounts);
  const expenseAccounts = accounts.filter((a) => a.category === 'EXPENSE' || a.category === 'COGS');

  const defaultSourceAccount =
    assetAccounts.find((a) => a.code.startsWith('1.1.01') || a.code.startsWith('10')) ??
    assetAccounts[0];

  const defaultExpenseAccount =
    expenseAccounts.find((a) => a.code.startsWith('6.1.03') || a.code === '6020') ??
    expenseAccounts[0];

  const totalLogistics = disbursements.filter((d) => d.category === 'LOGISTICS').length;
  const totalCustoms = disbursements.filter((d) => d.category === 'CUSTOMS_DUTIES').length;

  async function handleSubmit(formData: FormData) {
    'use server';
    const res = await recordDisbursementAction({ status: 'idle' }, formData);
    if (res.status === 'error') {
      redirect(`/accounting/expenses?error=${encodeURIComponent(res.error ?? 'Error')}`);
    }
    redirect('/accounting/expenses');
  }

  return (
    <Screen
      title="Gastos Operativos, Logística & Desembolsos"
      subtitle="Registro de pagos operativos (fletes, servicios, aranceles, suministros) con asientos de partida doble automáticos"
      action={
        <Link href="/accounting" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
          <ArrowLeft className="size-3.5" />
          <span>Volver a Contabilidad</span>
        </Link>
      }
    >
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total Egresos"
          value={String(disbursements.length)}
          icon={ReceiptText}
          tone="brand"
        />
        <Stat label="Logística & Fletes" value={String(totalLogistics)} icon={Truck} tone="amber" />
        <Stat
          label="Aduanas & Aranceles"
          value={String(totalCustoms)}
          icon={ShieldCheck}
          tone="violet"
        />
        <Stat label="Partida Doble" value="100% Cuadrada" icon={DollarSign} tone="emerald" />
      </div>

      {can(ctx.actor, 'accounting:write') && (
        <Card className="mb-8 p-4 sm:p-6">
          {errorKind && (
            <Alert tone="danger" role="alert" className="mb-4">
              {errorKind === 'InsufficientFunds'
                ? 'Fondos insuficientes en la cuenta origen seleccionada para registrar este egreso.'
                : `No se pudo registrar el egreso (${errorKind}).`}
            </Alert>
          )}
          <div className="mb-4 flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-control bg-brand-soft text-brand">
              <Truck className="size-4" strokeWidth={2} />
            </span>
            <h2 className="text-base font-semibold text-ink">
              Registrar Nuevo Egreso Operativo o Flete
            </h2>
          </div>

          <form action={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="exp-date" className={LABEL_CLASSES}>
                  Fecha del Pago
                </label>
                <input
                  id="exp-date"
                  type="date"
                  name="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                />
              </div>

              <div>
                <label htmlFor="exp-category" className={LABEL_CLASSES}>
                  Categoría del Gasto
                </label>
                <select
                  id="exp-category"
                  name="category"
                  defaultValue="LOGISTICS"
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                >
                  <option value="LOGISTICS">Logística, Fletes & Envíos</option>
                  <option value="UTILITIES_RENT">Servicios Públicos & Alquiler</option>
                  <option value="SUPPLIES">Suministros de Oficina & Operación</option>
                  <option value="MAINTENANCE">Mantenimiento & Reparaciones</option>
                  <option value="CUSTOMS_DUTIES">Aranceles & Trámites Aduanales</option>
                  <option value="SERVICES">Servicios Profesionales</option>
                  <option value="GENERAL">Otros Gastos Generales</option>
                </select>
              </div>

              <div>
                <label htmlFor="exp-beneficiary" className={LABEL_CLASSES}>
                  Beneficiario / Proveedor
                </label>
                <input
                  id="exp-beneficiary"
                  type="text"
                  name="beneficiary"
                  placeholder="Ej: Fletes & Logística Nacional C.A."
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                />
              </div>

              <div>
                <label htmlFor="exp-tax-id" className={LABEL_CLASSES}>
                  RIF / Identificación Fiscal
                </label>
                <input
                  id="exp-tax-id"
                  type="text"
                  name="taxId"
                  placeholder="Ej: J-12345678-9"
                  className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="exp-receipt" className={LABEL_CLASSES}>
                  N° Factura / Comprobante
                </label>
                <input
                  id="exp-receipt"
                  type="text"
                  name="receiptNumber"
                  placeholder="Ej: FAC-000492"
                  className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
                />
              </div>

              <div>
                <label htmlFor="exp-source" className={LABEL_CLASSES}>
                  Cuenta Origen (Fondos / Activo)
                </label>
                <select
                  id="exp-source"
                  name="sourceAccountId"
                  defaultValue={defaultSourceAccount?.id}
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                >
                  {assetAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="exp-account" className={LABEL_CLASSES}>
                  Cuenta de Destino (Gasto)
                </label>
                <select
                  id="exp-account"
                  name="expenseAccountId"
                  defaultValue={defaultExpenseAccount?.id}
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                >
                  {expenseAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="exp-amount" className={LABEL_CLASSES}>
                  Moneda & Monto
                </label>
                <div className="mt-1.5 flex gap-2">
                  <select
                    aria-label="Moneda"
                    name="currency"
                    defaultValue="USD"
                    className={`w-24 shrink-0 ${CONTROL_CLASSES}`}
                  >
                    <option value="USD">USD</option>
                    <option value="VES">VES</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <input
                    id="exp-amount"
                    type="text"
                    name="amount"
                    placeholder="0.00"
                    className={`min-w-0 flex-1 font-mono tabular-nums ${CONTROL_CLASSES}`}
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="exp-notes" className={LABEL_CLASSES}>
                Concepto / Justificación del Pago
              </label>
              <input
                id="exp-notes"
                type="text"
                name="notes"
                placeholder="Ej: Flete marítimo y despacho de contenedores al almacén central"
                className={`mt-1.5 ${CONTROL_CLASSES}`}
                required
              />
            </div>

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="submit" className={buttonClasses({ size: 'md' })}>
                Registrar Egreso y Asentar en Libro Diario
              </button>
            </div>
          </form>
        </Card>
      )}

      <SectionTitle>Egresos Registrados</SectionTitle>
      {disbursements.length === 0 ? (
        <Empty>No hay egresos operativos ni gastos logísticos registrados.</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-line bg-canvas text-xs text-muted">
              <th className="px-4 py-3 font-medium"># Egreso</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Beneficiario</th>
              <th className="px-4 py-3 font-medium">Comprobante</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Concepto</th>
              <th className="px-4 py-3 font-medium">Asiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {disbursements.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-mono font-medium text-ink">
                  #{d.disbursementNumber}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={d.category === 'LOGISTICS' ? 'warn' : 'neutral'}>{d.category}</Badge>
                </td>
                <td className="px-4 py-3 text-ink">
                  <div className="font-medium">{d.beneficiary}</div>
                  {d.taxId && <div className="font-mono text-[11px] text-muted">{d.taxId}</div>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                  {d.receiptNumber ?? 'N/A'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{d.date.slice(0, 10)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-warn-ink">
                  {d.amount} {d.currency}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-muted">{d.notes}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href="/accounting/journal-entries" className="text-brand hover:underline">
                    {d.journalEntryId.slice(0, 8)}...
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Screen>
  );
}
