import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { listPartnerDrawings } from '@/api/partner-drawings';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, UserMinus, Banknote, PackageCheck } from 'lucide-react';
import {
  recordPartnerCashDrawingAction,
  recordPartnerStockDrawingAction,
} from '@/actions/partner-drawings';

export default async function PartnerDrawingsPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Retiros de Socios & Autoconsumo">
        <NoAccess />
      </Screen>
    );
  }

  const [drawings, accounts] = await Promise.all([
    listPartnerDrawings().catch(() => []),
    listAccounts().catch(() => []),
  ]);

  const equityAccounts = accounts.filter(
    (a) => a.category === 'EQUITY' || (a.category === 'ASSET' && a.code.startsWith('1.2')),
  );
  const cashAccounts = accounts.filter(
    (a) => a.category === 'ASSET' && a.code.startsWith('1.1.01'),
  );
  const inventoryAccounts = accounts.filter(
    (a) => a.category === 'ASSET' && (a.code.startsWith('1.1.03') || a.code === '1400'),
  );

  const defaultDrawingAccount =
    equityAccounts.find((a) => a.code.startsWith('3.1.02') || a.code === '3020') ??
    equityAccounts[0];
  const defaultCashAccount = cashAccounts[0] ?? accounts.find((a) => a.category === 'ASSET');
  const defaultInventoryAccount =
    inventoryAccounts[0] ?? accounts.find((a) => a.category === 'ASSET');

  async function handleCashSubmit(formData: FormData) {
    'use server';
    await recordPartnerCashDrawingAction({ status: 'idle' }, formData);
  }

  async function handleStockSubmit(formData: FormData) {
    'use server';
    await recordPartnerStockDrawingAction({ status: 'idle' }, formData);
  }

  return (
    <Screen
      title="Retiros de Socios & Autoconsumo Interno"
      subtitle="Trazabilidad estricta de salida de dinero y consumo de inventario por accionistas o propietarios"
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <UserMinus className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Total Retiros Registrados</p>
              <p className="text-xl font-semibold text-zinc-100">{drawings.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Retiros de Efectivo</p>
              <p className="text-xl font-semibold text-zinc-100">
                {drawings.filter((d) => d.drawingType === 'CASH').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">Autoconsumo de Mercancía</p>
              <p className="text-xl font-semibold text-zinc-100">
                {drawings.filter((d) => d.drawingType === 'STOCK').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {can(ctx.actor, 'accounting:write') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-400" />
              Retiro de Efectivo / Dividendos Anticipados
            </h2>

            <form action={handleCashSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Fecha</label>
                  <input
                    type="date"
                    name="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Moneda</label>
                  <select
                    name="currency"
                    defaultValue="USD"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  >
                    <option value="USD">USD</option>
                    <option value="VES">VES</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">ID Socio</label>
                  <input
                    type="text"
                    name="partnerId"
                    defaultValue="partner-01"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Nombre del Socio
                  </label>
                  <input
                    type="text"
                    name="partnerName"
                    placeholder="Ej: Socio Principal"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Cuenta Retiro (Débito)
                  </label>
                  <select
                    name="drawingAccountId"
                    defaultValue={defaultDrawingAccount?.id}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  >
                    {equityAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Cuenta Origen (Crédito)
                  </label>
                  <select
                    name="cashAccountId"
                    defaultValue={defaultCashAccount?.id}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  >
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Monto Retirado
                </label>
                <input
                  type="text"
                  name="amount"
                  placeholder="Ej: 200.00"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Motivo / Explicación
                </label>
                <input
                  type="text"
                  name="notes"
                  placeholder="Ej: Retiro personal de caja chica"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-md transition-colors"
              >
                Registrar Retiro de Efectivo
              </button>
            </form>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-blue-400" />
              Autoconsumo de Inventario / Mercancía
            </h2>

            <form action={handleStockSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Fecha</label>
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
                    Moneda de Costo
                  </label>
                  <select
                    name="currency"
                    defaultValue="USD"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  >
                    <option value="USD">USD</option>
                    <option value="VES">VES</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Nombre del Socio
                  </label>
                  <input
                    type="text"
                    name="partnerName"
                    placeholder="Ej: Socio Principal"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  />
                  <input type="hidden" name="partnerId" value="partner-01" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Código de Producto
                  </label>
                  <input
                    type="text"
                    name="productId"
                    placeholder="Ej: PROD-001"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Cuenta Retiro (Débito)
                  </label>
                  <select
                    name="drawingAccountId"
                    defaultValue={defaultDrawingAccount?.id}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  >
                    {equityAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Cuenta Inventario (Crédito)
                  </label>
                  <select
                    name="inventoryAccountId"
                    defaultValue={defaultInventoryAccount?.id}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  >
                    {inventoryAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Cantidad Retirada
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    name="quantity"
                    placeholder="Ej: 5"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Costo Unitario
                  </label>
                  <input
                    type="text"
                    name="unitCost"
                    placeholder="Ej: 20.00"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Motivo / Explicación
                </label>
                <input
                  type="text"
                  name="notes"
                  placeholder="Ej: Autoconsumo de producto para uso particular"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-md transition-colors"
              >
                Registrar Autoconsumo de Mercancía
              </button>
            </form>
          </div>
        </div>
      )}

      <TableFrame>
        {drawings.length === 0 ? (
          <Empty>No hay retiros ni autoconsumo de socios registrados.</Empty>
        ) : (
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="py-2.5 px-3"># Retiro</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Socio</th>
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3 text-right">Monto / Valor</th>
                <th className="py-2.5 px-3">Detalle / Mercancía</th>
                <th className="py-2.5 px-3">Explicación</th>
                <th className="py-2.5 px-3">Asiento</th>
                <th className="py-2.5 px-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {drawings.map((d) => (
                <tr key={d.id} className="hover:bg-zinc-800/30">
                  <td className="py-2.5 px-3 font-mono font-medium text-zinc-200">
                    #{d.drawingNumber}
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge tone={d.drawingType === 'CASH' ? 'success' : 'neutral'}>
                      {d.drawingType === 'CASH' ? 'Efectivo' : 'Mercancía'}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-zinc-100">{d.partnerName}</td>
                  <td className="py-2.5 px-3">{d.date.slice(0, 10)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-400 font-semibold">
                    {d.amount} {d.currency}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-zinc-300">
                    {d.drawingType === 'STOCK' ? `${d.quantity}x (${d.productId})` : 'Caja/Banco'}
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400 truncate max-w-[180px]">{d.notes}</td>
                  <td className="py-2.5 px-3 font-mono text-zinc-400">
                    <Link href="/accounting/journal" className="text-blue-400 hover:underline">
                      {d.journalEntryId.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge tone={d.status === 'COMPLETED' ? 'success' : 'neutral'}>
                      {d.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
    </Screen>
  );
}
