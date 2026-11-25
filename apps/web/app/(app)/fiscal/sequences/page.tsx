import Link from 'next/link';
import { apiForRequest } from '@/api/session';
import { listFiscalSequenceRanges } from '@/api/fiscal';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ArrowLeft, FileCheck2, Calendar } from 'lucide-react';

function rangeAlertBadge(remainingPercent: number, isExpired: boolean) {
  if (isExpired) {
    return <Badge tone="danger">Vencido</Badge>;
  }
  if (remainingPercent <= 0) {
    return <Badge tone="danger">Agotado</Badge>;
  }
  if (remainingPercent <= 10) {
    return <Badge tone="warn">Por Agotarse (&lt;10%)</Badge>;
  }
  return <Badge tone="success">Disponible</Badge>;
}

export default async function FiscalSequencesPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Rangos de Numeración Fiscal">
        <NoAccess />
      </Screen>
    );
  }

  const ranges = await listFiscalSequenceRanges().catch(() => []);

  return (
    <Screen
      title="Rangos y Vencimientos Fiscales"
      subtitle="Control de autorizaciones, series, caducidad de talonarios y control de correlativos"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/fiscal/withholdings"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <span>Retenciones Fiscales</span>
          </Link>
          <Link
            href="/invoicing"
            className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            <ArrowLeft className="size-3.5" />
            <span>Facturación</span>
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {ranges.length === 0 ? (
          <Empty icon={FileCheck2}>
            No existen rangos de numeración fiscal autorizados configurados.
          </Empty>
        ) : (
          <TableFrame>
            <thead>
              <tr className="border-b border-line bg-surface-raised text-xs font-semibold text-text-muted">
                <th className="px-4 py-3">Tipo Documento</th>
                <th className="px-4 py-3">Serie / Prefijo</th>
                <th className="px-4 py-3 text-right">Rango Desde</th>
                <th className="px-4 py-3 text-right">Rango Hasta</th>
                <th className="px-4 py-3 text-right">Siguiente Nº</th>
                <th className="px-4 py-3">Vencimiento</th>
                <th className="px-4 py-3">Estado / Alerta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ranges.map((r) => {
                const totalSeq = BigInt(r.toNumber) - BigInt(r.fromNumber) + 1n;
                const used = BigInt(r.currentNumber) - BigInt(r.fromNumber);
                const remaining = totalSeq - used;
                const remainingPercent = Number((remaining * 100n) / (totalSeq || 1n));
                const isExpired = r.expiresAt
                  ? new Date(r.expiresAt).getTime() < Date.now()
                  : false;

                return (
                  <tr key={r.id} className="hover:bg-brand-soft/20">
                    <td className="px-4 py-3 font-semibold text-text">{r.documentType}</td>
                    <td className="px-4 py-3 font-mono text-text">{r.prefix || '—'}</td>
                    <td className="px-4 py-3 font-mono text-right text-text">{r.fromNumber}</td>
                    <td className="px-4 py-3 font-mono text-right text-text">{r.toNumber}</td>
                    <td className="px-4 py-3 font-mono text-right font-bold text-brand">
                      {r.currentNumber}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {r.expiresAt ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3 text-text-muted" />
                          <span>{new Date(r.expiresAt).toLocaleDateString('es-VE')}</span>
                        </div>
                      ) : (
                        'Sin vencimiento'
                      )}
                    </td>
                    <td className="px-4 py-3">{rangeAlertBadge(remainingPercent, isExpired)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableFrame>
        )}
      </div>
    </Screen>
  );
}
