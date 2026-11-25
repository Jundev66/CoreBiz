import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listWithholdingVouchers } from '@/api/fiscal';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, Receipt } from 'lucide-react';

function formatMinor(minorStr: string, currency = 'USD'): string {
  const minor = BigInt(minorStr || '0');
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major.toLocaleString('es-VE')}.${cents} ${currency}`;
}

function withholdingTypeLabel(type: string) {
  switch (type) {
    case 'IVA_75':
      return 'IVA 75% (SENIAT)';
    case 'IVA_100':
      return 'IVA 100% (SENIAT)';
    case 'ISLR':
      return 'ISLR Retención';
    case 'US_1099_BACKUP':
      return 'US 1099 Backup';
    default:
      return type;
  }
}

function withholdingStatusBadge(status: string) {
  switch (status) {
    case 'ISSUED':
      return <Badge tone="brand">Emitido</Badge>;
    case 'DECLARED':
      return <Badge tone="success">Declarado</Badge>;
    case 'VOID':
      return <Badge tone="danger">Anulado</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

export default async function WithholdingsPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Retenciones Fiscales">
        <NoAccess />
      </Screen>
    );
  }

  const vouchers = await listWithholdingVouchers().catch(() => []);

  return (
    <Screen
      title="Comprobantes de Retención Fiscal"
      subtitle="Retenciones de IVA / ISLR (Providencias SENIAT) y Retenciones US 1099"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/fiscal/sequences"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <span>Rangos Fiscales</span>
          </Link>
          <Link
            href="/fiscal/sales-book"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <ArrowLeft className="size-3.5" />
            <span>Libros Fiscales</span>
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {vouchers.length === 0 ? (
          <Empty icon={Receipt}>
            Aún no se han emitido comprobantes de retención fiscal en este ejercicio.
          </Empty>
        ) : (
          <TableFrame>
            <thead>
              <tr className="border-b border-line bg-surface-raised text-xs font-semibold text-text-muted">
                <th className="px-4 py-3">Nº Comprobante</th>
                <th className="px-4 py-3">Tipo Retención</th>
                <th className="px-4 py-3">Beneficiario / RIF</th>
                <th className="px-4 py-3">Período</th>
                <th className="px-4 py-3 text-right">Base Imponible</th>
                <th className="px-4 py-3 text-right">Monto Retenido</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha Emisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {vouchers.map((v) => (
                <tr key={v.id} className="hover:bg-brand-soft/20">
                  <td className="px-4 py-3 font-mono font-medium text-text">{v.voucherNumber}</td>
                  <td className="px-4 py-3 text-text">{withholdingTypeLabel(v.withholdingType)}</td>
                  <td className="px-4 py-3 text-text">
                    <div className="flex flex-col">
                      <span className="font-medium">{v.supplierName}</span>
                      <span className="text-xs text-text-muted">{v.supplierTaxId}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{v.fiscalPeriod}</td>
                  <td className="px-4 py-3 text-right text-text">
                    {formatMinor(v.taxableBaseMinor, v.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-brand">
                    {formatMinor(v.withheldAmountMinor, v.currency)}
                  </td>
                  <td className="px-4 py-3">{withholdingStatusBadge(v.status)}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {new Date(v.issuedAt).toLocaleDateString('es-VE')}
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
