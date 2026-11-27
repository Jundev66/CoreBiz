import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { listDisbursements } from '@/api/disbursements';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, Truck, ReceiptText, ShieldCheck, DollarSign } from 'lucide-react';
import { recordDisbursementAction } from '@/actions/disbursements';
import { filterLiquidAssetAccounts } from '@/ui/account-filters';

export default async function ExpensesPage() {
  const { ctx } = await apiForRequest();

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
    await recordDisbursementAction({ status: 'idle' }, formData);
  }

  return (
    <Screen
      title="Gastos Operativos, Logística & Desembolsos"
      subtitle="Registro de pagos operativos (fletes, servicios, aranceles, suministros) con asientos de partida doble automáticos"
      action={
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a Contabilidad
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Total Egresos</p>
              <p className="text-xl font-semibold text-zinc-100">{disbursements.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Logística & Fletes</p>
              <p className="text-xl font-semibold text-zinc-100">{totalLogistics}</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Aduanas & Aranceles</p>
              <p className="text-xl font-semibold text-zinc-100">{totalCustoms}</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Partida Doble</p>
              <p className="text-xl font-semibold text-emerald-400">100% Cuadrada</p>
            </div>
          </div>
        </div>
      </div>

      {can(ctx.actor, 'accounting:write') && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-400" />
            Registrar Nuevo Egreso Operativo o Flete
          </h2>

          <form action={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Fecha del Pago
                </label>
                <input
                  type="date"
                  name="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Categoría del Gasto
                </label>
                <select
                  name="category"
                  defaultValue="LOGISTICS"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
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
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Beneficiario / Proveedor
                </label>
                <input
                  type="text"
                  name="beneficiary"
                  placeholder="Ej: Fletes & Logística Nacional C.A."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  RIF / Identificación Fiscal
                </label>
                <input
                  type="text"
                  name="taxId"
                  placeholder="Ej: J-12345678-9"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  N° Factura / Comprobante
                </label>
                <input
                  type="text"
                  name="receiptNumber"
                  placeholder="Ej: FAC-000492"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Cuenta Origen (Fondos / Activo)
                </label>
                <select
                  name="sourceAccountId"
                  defaultValue={defaultSourceAccount?.id}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
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
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Cuenta de Destino (Gasto)
                </label>
                <select
                  name="expenseAccountId"
                  defaultValue={defaultExpenseAccount?.id}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
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
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Moneda & Monto
                </label>
                <div className="flex gap-2">
                  <select
                    name="currency"
                    defaultValue="USD"
                    className="w-24 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="USD">USD</option>
                    <option value="VES">VES</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <input
                    type="text"
                    name="amount"
                    placeholder="0.00"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Concepto / Justificación del Pago
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Ej: Flete marítimo y despacho de contenedores al almacén central"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                required
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-md transition-colors"
              >
                Registrar Egreso y Asentar en Libro Diario
              </button>
            </div>
          </form>
        </div>
      )}

      {disbursements.length === 0 ? (
        <Empty>No hay egresos operativos ni gastos logísticos registrados.</Empty>
      ) : (
        <TableFrame>
          <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
            <tr>
              <th className="py-2.5 px-3"># Egreso</th>
              <th className="py-2.5 px-3">Categoría</th>
              <th className="py-2.5 px-3">Beneficiario</th>
              <th className="py-2.5 px-3">Comprobante</th>
              <th className="py-2.5 px-3">Fecha</th>
              <th className="py-2.5 px-3 text-right">Monto</th>
              <th className="py-2.5 px-3">Concepto</th>
              <th className="py-2.5 px-3">Asiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {disbursements.map((d) => (
              <tr key={d.id} className="hover:bg-zinc-800/30">
                <td className="py-2.5 px-3 font-mono font-medium text-zinc-200">
                  #{d.disbursementNumber}
                </td>
                <td className="py-2.5 px-3">
                  <Badge tone={d.category === 'LOGISTICS' ? 'warn' : 'neutral'}>{d.category}</Badge>
                </td>
                <td className="py-2.5 px-3 font-medium text-zinc-100">
                  <div>{d.beneficiary}</div>
                  {d.taxId && <div className="text-[10px] text-zinc-500 font-mono">{d.taxId}</div>}
                </td>
                <td className="py-2.5 px-3 font-mono text-zinc-300">{d.receiptNumber ?? 'N/A'}</td>
                <td className="py-2.5 px-3">{d.date.slice(0, 10)}</td>
                <td className="py-2.5 px-3 text-right font-mono text-amber-400 font-semibold">
                  {d.amount} {d.currency}
                </td>
                <td className="py-2.5 px-3 text-zinc-400 truncate max-w-[200px]">{d.notes}</td>
                <td className="py-2.5 px-3 font-mono text-zinc-400">
                  <Link
                    href="/accounting/journal-entries"
                    className="text-blue-400 hover:underline"
                  >
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
