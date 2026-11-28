import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { listPartnerDrawings } from '@/api/partner-drawings';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Alert, Badge } from '@/ui/feedback';
import { Card, SectionTitle, Stat } from '@/ui/primitives';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field-classes';
import { buttonClasses } from '@/ui/button';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, UserMinus, Banknote, PackageCheck } from 'lucide-react';
import {
  recordPartnerCashDrawingAction,
  recordPartnerStockDrawingAction,
} from '@/actions/partner-drawings';

export default async function PartnerDrawingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { ctx } = await apiForRequest();
  const { error: errorKind } = await searchParams;

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
    const res = await recordPartnerCashDrawingAction({ status: 'idle' }, formData);
    if (res.status === 'error') {
      redirect(`/accounting/drawings?error=${encodeURIComponent(res.error ?? 'Error')}`);
    }
    redirect('/accounting/drawings');
  }

  async function handleStockSubmit(formData: FormData) {
    'use server';
    const res = await recordPartnerStockDrawingAction({ status: 'idle' }, formData);
    if (res.status === 'error') {
      redirect(`/accounting/drawings?error=${encodeURIComponent(res.error ?? 'Error')}`);
    }
    redirect('/accounting/drawings');
  }

  return (
    <Screen
      title="Retiros de Socios & Autoconsumo Interno"
      subtitle="Trazabilidad estricta de salida de dinero y consumo de inventario por accionistas o propietarios"
      action={
        <Link href="/accounting" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
          <ArrowLeft className="size-3.5" />
          <span>Volver a Contabilidad</span>
        </Link>
      }
    >
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Total Retiros Registrados"
          value={String(drawings.length)}
          icon={UserMinus}
          tone="amber"
        />
        <Stat
          label="Retiros de Efectivo"
          value={String(drawings.filter((d) => d.drawingType === 'CASH').length)}
          icon={Banknote}
          tone="emerald"
        />
        <Stat
          label="Autoconsumo de Mercancía"
          value={String(drawings.filter((d) => d.drawingType === 'STOCK').length)}
          icon={PackageCheck}
          tone="brand"
        />
      </div>

      {errorKind && (
        <Alert tone="danger" role="alert" className="mb-6">
          No se pudo registrar la operación ({errorKind}). Verificá los montos y cuentas
          seleccionadas.
        </Alert>
      )}

      {can(ctx.actor, 'accounting:write') && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
              <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>Retiro de Efectivo / Dividendos Anticipados</span>
            </h2>

            <form action={handleCashSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASSES}>Fecha</label>
                  <input
                    type="date"
                    name="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                    required
                  />
                </div>

                <div>
                  <label className={LABEL_CLASSES}>Moneda</label>
                  <select
                    name="currency"
                    defaultValue="USD"
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                    required
                  >
                    <option value="USD">USD</option>
                    <option value="VES">VES</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASSES}>ID Socio</label>
                  <input
                    type="text"
                    name="partnerId"
                    defaultValue="partner-01"
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                    required
                  />
                </div>

                <div>
                  <label className={LABEL_CLASSES}>Nombre del Socio</label>
                  <input
                    type="text"
                    name="partnerName"
                    placeholder="Ej: Socio Principal"
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASSES}>Cuenta Retiro (Débito)</label>
                  <select
                    name="drawingAccountId"
                    defaultValue={defaultDrawingAccount?.id}
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
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
                  <label className={LABEL_CLASSES}>Cuenta Origen (Crédito)</label>
                  <select
                    name="cashAccountId"
                    defaultValue={defaultCashAccount?.id}
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
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
                <label className={LABEL_CLASSES}>Monto Retirado</label>
                <input
                  type="text"
                  name="amount"
                  placeholder="Ej: 200.00"
                  className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
                  required
                />
              </div>

              <div>
                <label className={LABEL_CLASSES}>Motivo / Explicación</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="Ej: Retiro personal de caja chica"
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                />
              </div>

              <button type="submit" className={buttonClasses({ className: 'w-full' })}>
                Registrar Retiro de Efectivo
              </button>
            </form>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
              <PackageCheck className="size-4 text-brand" />
              <span>Autoconsumo de Inventario / Mercancía</span>
            </h2>

            <form action={handleStockSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASSES}>Fecha</label>
                  <input
                    type="date"
                    name="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                    required
                  />
                </div>

                <div>
                  <label className={LABEL_CLASSES}>Moneda de Costo</label>
                  <select
                    name="currency"
                    defaultValue="USD"
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                    required
                  >
                    <option value="USD">USD</option>
                    <option value="VES">VES</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASSES}>Nombre del Socio</label>
                  <input
                    type="text"
                    name="partnerName"
                    placeholder="Ej: Socio Principal"
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                    required
                  />
                  <input type="hidden" name="partnerId" value="partner-01" />
                </div>

                <div>
                  <label className={LABEL_CLASSES}>Código de Producto</label>
                  <input
                    type="text"
                    name="productId"
                    placeholder="Ej: PROD-001"
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASSES}>Cuenta Retiro (Débito)</label>
                  <select
                    name="drawingAccountId"
                    defaultValue={defaultDrawingAccount?.id}
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
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
                  <label className={LABEL_CLASSES}>Cuenta Inventario (Crédito)</label>
                  <select
                    name="inventoryAccountId"
                    defaultValue={defaultInventoryAccount?.id}
                    className={`mt-1.5 ${CONTROL_CLASSES}`}
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASSES}>Cantidad Retirada</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    name="quantity"
                    placeholder="Ej: 5"
                    className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
                    required
                  />
                </div>

                <div>
                  <label className={LABEL_CLASSES}>Costo Unitario</label>
                  <input
                    type="text"
                    name="unitCost"
                    placeholder="Ej: 20.00"
                    className={`mt-1.5 font-mono ${CONTROL_CLASSES}`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASSES}>Motivo / Explicación</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="Ej: Autoconsumo de producto para uso particular"
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                  required
                />
              </div>

              <button
                type="submit"
                className={buttonClasses({ variant: 'secondary', className: 'w-full' })}
              >
                Registrar Autoconsumo de Mercancía
              </button>
            </form>
          </Card>
        </div>
      )}

      <SectionTitle>Historial de Retiros</SectionTitle>
      {drawings.length === 0 ? (
        <Empty>No hay retiros ni autoconsumo de socios registrados.</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-line bg-canvas text-xs text-muted">
              <th className="px-4 py-3 font-medium"># Retiro</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Socio</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 text-right font-medium">Monto / Valor</th>
              <th className="px-4 py-3 font-medium">Detalle / Mercancía</th>
              <th className="px-4 py-3 font-medium">Explicación</th>
              <th className="px-4 py-3 font-medium">Asiento</th>
              <th className="px-4 py-3 text-center font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {drawings.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-mono font-medium text-ink">#{d.drawingNumber}</td>
                <td className="px-4 py-3">
                  <Badge tone={d.drawingType === 'CASH' ? 'success' : 'neutral'}>
                    {d.drawingType === 'CASH' ? 'Efectivo' : 'Mercancía'}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-medium text-ink">{d.partnerName}</td>
                <td className="px-4 py-3 text-muted">{d.date.slice(0, 10)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-warn-ink">
                  {d.amount} {d.currency}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                  {d.drawingType === 'STOCK' ? `${d.quantity}x (${d.productId})` : 'Caja/Banco'}
                </td>
                <td className="max-w-[180px] truncate px-4 py-3 text-xs text-muted">{d.notes}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href="/accounting/journal-entries" className="text-brand hover:underline">
                    {d.journalEntryId.slice(0, 8)}...
                  </Link>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge tone={d.status === 'COMPLETED' ? 'success' : 'neutral'}>{d.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Screen>
  );
}
