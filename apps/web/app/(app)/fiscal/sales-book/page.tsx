import { apiForRequest } from '@/api/session';
import { getSalesBook } from '@/api/fiscal-reports';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

function formatMinor(minorStr: string, currency = 'VES'): string {
  const minor = BigInt(minorStr);
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major}.${cents} ${currency}`;
}

export default async function SalesBookPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Libro Especial de Ventas">
        <NoAccess />
      </Screen>
    );
  }

  const salesBook = await getSalesBook().catch(() => null);

  return (
    <Screen
      title="Libro Especial de Ventas"
      subtitle="Reporte tributario reglamentario SENIAT (Providencias SNAT/2026/00084 y 00093)"
    >
      {salesBook === null || salesBook.records.length === 0 ? (
        <Empty>No hay operaciones de venta registradas para el período actual.</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-border bg-surface-raised/40 text-xs font-medium text-text-muted">
              <th className="px-3 py-2 text-center">Oper.</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">RIF / Cédula</th>
              <th className="px-3 py-2">Razón Social</th>
              <th className="px-3 py-2">Nro. Factura</th>
              <th className="px-3 py-2">Nro. Control</th>
              <th className="px-3 py-2 text-right">Total Ventas</th>
              <th className="px-3 py-2 text-right">Ventas Exentas</th>
              <th className="px-3 py-2 text-right">Base 16%</th>
              <th className="px-3 py-2 text-right">IVA (16%)</th>
              <th className="px-3 py-2 text-right">IGTF (3%)</th>
              <th className="px-3 py-2 text-center">Tipo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-mono text-xs">
            {salesBook.records.map((r) => (
              <tr
                key={`${r.operationNumber}-${r.documentNumber}`}
                className="hover:bg-surface-raised/20 transition-colors"
              >
                <td className="px-3 py-2 text-center text-text-muted">{r.operationNumber}</td>
                <td className="px-3 py-2">{new Date(r.issueDate).toLocaleDateString()}</td>
                <td className="px-3 py-2 font-bold text-brand">{r.customerTaxId}</td>
                <td className="px-3 py-2 font-sans font-medium text-text">{r.customerName}</td>
                <td className="px-3 py-2 font-bold">{r.documentNumber}</td>
                <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">
                  {r.controlNumber ?? '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatMinor(r.totalSalesMinor, r.currency)}
                </td>
                <td className="px-3 py-2 text-right text-text-muted">
                  {formatMinor(r.exemptSalesMinor, r.currency)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatMinor(r.taxableBaseGeneralMinor, r.currency)}
                </td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatMinor(r.taxGeneralMinor, r.currency)}
                </td>
                <td className="px-3 py-2 text-right text-text-muted">
                  {formatMinor(r.igtfMinor, r.currency)}
                </td>
                <td className="px-3 py-2 text-center font-sans">
                  <Badge tone={r.documentType === 'NOTA_CREDITO' ? 'danger' : 'neutral'}>
                    {r.documentType === 'NOTA_CREDITO' ? 'NC' : 'FAC'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-raised/60 font-mono text-xs font-bold text-text">
              <td colSpan={6} className="px-3 py-2.5 font-sans text-right">
                Totales Reglamentarios:
              </td>
              <td className="px-3 py-2.5 text-right">
                {formatMinor(salesBook.totalSalesMinor, salesBook.currency)}
              </td>
              <td className="px-3 py-2.5 text-right">
                {formatMinor(salesBook.totalExemptMinor, salesBook.currency)}
              </td>
              <td className="px-3 py-2.5 text-right">
                {formatMinor(salesBook.totalTaxableBaseMinor, salesBook.currency)}
              </td>
              <td className="px-3 py-2.5 text-right">
                {formatMinor(salesBook.totalTaxDebitMinor, salesBook.currency)}
              </td>
              <td className="px-3 py-2.5 text-right">
                {formatMinor(salesBook.totalIgtfMinor, salesBook.currency)}
              </td>
              <td className="px-3 py-2.5"></td>
            </tr>
          </tfoot>
        </TableFrame>
      )}
    </Screen>
  );
}
