import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { getArAging, getApAging } from '@/api/accounting';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, Clock, Building2, Users } from 'lucide-react';

function formatMinor(minorStr: string, currency = 'USD'): string {
  const minor = BigInt(minorStr || '0');
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major.toLocaleString('es-VE')}.${cents} ${currency}`;
}

export default async function AgingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string; currency?: string; asOfDate?: string }>;
}) {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Antigüedad de Deuda (Aging)">
        <NoAccess />
      </Screen>
    );
  }

  const {
    direction: queryDirection,
    currency: queryCurrency,
    asOfDate: queryAsOfDate,
  } = await searchParams;
  const isAp = queryDirection === 'ap';
  const currency = queryCurrency ?? 'USD';

  const report = isAp
    ? await getApAging(queryAsOfDate, undefined, currency).catch(() => null)
    : await getArAging(queryAsOfDate, undefined, currency).catch(() => null);

  const directionLabel = isAp ? 'Cuentas por Pagar (Proveedores)' : 'Cuentas por Cobrar (Clientes)';
  const partnerHeader = isAp ? 'Proveedor' : 'Cliente';

  return (
    <Screen
      title="Antigüedad de Saldos (Aging Analysis)"
      subtitle={`Clasificación cronológica de vencimientos para ${directionLabel}`}
      action={
        <div className="flex items-center gap-2">
          <Link
            href={`/accounting/aging?direction=${isAp ? 'ar' : 'ap'}`}
            className="flex items-center gap-1.5 rounded-control border border-brand bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft/80"
          >
            {isAp ? <Users className="size-3.5" /> : <Building2 className="size-3.5" />}
            <span>Ver {isAp ? 'Por Cobrar (AR)' : 'Por Pagar (AP)'}</span>
          </Link>
          <Link
            href="/accounting"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <ArrowLeft className="size-3.5" />
            <span>Volver</span>
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col rounded-card border border-line bg-surface p-3 shadow-sm">
            <span className="text-xs font-medium text-text-muted">Total Cartera</span>
            <span className="mt-1 text-base font-bold text-text">
              {formatMinor(report?.totalOpenMinor ?? '0', currency)}
            </span>
          </div>
          <div className="flex flex-col rounded-card border border-emerald-500/20 bg-emerald-500/5 p-3 shadow-sm">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Corriente (No vencido)
            </span>
            <span className="mt-1 text-base font-bold text-emerald-700 dark:text-emerald-400">
              {formatMinor(report?.totalCurrentMinor ?? '0', currency)}
            </span>
          </div>
          <div className="flex flex-col rounded-card border border-amber-500/20 bg-amber-500/5 p-3 shadow-sm">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              1 a 30 Días
            </span>
            <span className="mt-1 text-base font-bold text-amber-700 dark:text-amber-400">
              {formatMinor(report?.totalDays1To30Minor ?? '0', currency)}
            </span>
          </div>
          <div className="flex flex-col rounded-card border border-orange-500/20 bg-orange-500/5 p-3 shadow-sm">
            <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
              31 a 60 Días
            </span>
            <span className="mt-1 text-base font-bold text-orange-700 dark:text-orange-400">
              {formatMinor(report?.totalDays31To60Minor ?? '0', currency)}
            </span>
          </div>
          <div className="flex flex-col rounded-card border border-red-500/20 bg-red-500/5 p-3 shadow-sm">
            <span className="text-xs font-medium text-red-700 dark:text-red-400">61 a 90 Días</span>
            <span className="mt-1 text-base font-bold text-red-700 dark:text-red-400">
              {formatMinor(report?.totalDays61To90Minor ?? '0', currency)}
            </span>
          </div>
          <div className="flex flex-col rounded-card border border-rose-600/30 bg-rose-600/10 p-3 shadow-sm">
            <span className="text-xs font-medium text-rose-700 dark:text-rose-400">
              &gt; 90 Días (Mora)
            </span>
            <span className="mt-1 text-base font-bold text-rose-700 dark:text-rose-400">
              {formatMinor(report?.totalDays90PlusMinor ?? '0', currency)}
            </span>
          </div>
        </div>

        {report === null || report.partners.length === 0 ? (
          <Empty icon={Clock}>
            No se encontraron documentos pendientes con saldo abierto para la fecha seleccionada.
          </Empty>
        ) : (
          <TableFrame>
            <thead>
              <tr className="border-b border-line bg-surface-raised text-xs font-semibold text-text-muted">
                <th className="px-4 py-3">{partnerHeader}</th>
                <th className="px-4 py-3 text-right">Al Corriente</th>
                <th className="px-4 py-3 text-right">1-30 Días</th>
                <th className="px-4 py-3 text-right">31-60 Días</th>
                <th className="px-4 py-3 text-right">61-90 Días</th>
                <th className="px-4 py-3 text-right">&gt;90 Días</th>
                <th className="px-4 py-3 text-right">Total Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.partners.map((partner) => (
                <tr key={partner.entityId} className="hover:bg-brand-soft/20">
                  <td className="px-4 py-3 font-medium text-text">
                    <div className="flex flex-col">
                      <span>{partner.entityName}</span>
                      {partner.taxId && (
                        <span className="text-xs text-text-muted">{partner.taxId}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-text">
                    {formatMinor(partner.currentMinor, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400">
                    {formatMinor(partner.days1To30Minor, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-orange-700 dark:text-orange-400">
                    {formatMinor(partner.days31To60Minor, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-red-700 dark:text-red-400">
                    {formatMinor(partner.days61To90Minor, currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-rose-700 dark:text-rose-400">
                    {formatMinor(partner.days90PlusMinor, currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-text">
                    {formatMinor(partner.totalOpenMinor, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </div>
    </Screen>
  );
}
