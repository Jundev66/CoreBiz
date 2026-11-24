import { apiForRequest } from '@/api/session';
import { getUsTaxSummary } from '@/api/fiscal-reports';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

function formatMinor(minorStr: string, currency = 'USD'): string {
  const minor = BigInt(minorStr);
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major}.${cents} ${currency}`;
}

export default async function UsSalesTaxPage() {
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="US Sales Tax Remittance Summary">
        <NoAccess />
      </Screen>
    );
  }

  const taxSummary = await getUsTaxSummary().catch(() => null);

  return (
    <Screen
      title="US Sales Tax Remittance Summary"
      subtitle="Multi-state & local jurisdiction tax breakdown for Form 1099 and Sales Tax filings"
    >
      {taxSummary === null || taxSummary.jurisdictions.length === 0 ? (
        <Empty>No sales tax records found for the active tax period.</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-border bg-surface-raised/40 text-xs font-medium text-text-muted">
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Tax Jurisdiction</th>
              <th className="px-4 py-3 text-right">Gross Sales</th>
              <th className="px-4 py-3 text-right">Exempt Sales</th>
              <th className="px-4 py-3 text-right">Taxable Sales</th>
              <th className="px-4 py-3 text-right">Tax Rate</th>
              <th className="px-4 py-3 text-right">Tax Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-mono text-xs">
            {taxSummary.jurisdictions.map((j) => (
              <tr
                key={`${j.stateCode}-${j.jurisdictionName}`}
                className="hover:bg-surface-raised/20 transition-colors"
              >
                <td className="px-4 py-3 font-bold text-brand">{j.stateCode}</td>
                <td className="px-4 py-3 font-sans font-medium text-text">{j.jurisdictionName}</td>
                <td className="px-4 py-3 text-right">
                  {formatMinor(j.grossSalesMinor, j.currency)}
                </td>
                <td className="px-4 py-3 text-right text-text-muted">
                  {formatMinor(j.exemptSalesMinor, j.currency)}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatMinor(j.taxableSalesMinor, j.currency)}
                </td>
                <td className="px-4 py-3 text-right text-text-muted">{j.taxRatePercentage}%</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                  {formatMinor(j.taxCollectedMinor, j.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-raised/60 font-mono text-xs font-bold text-text">
              <td colSpan={2} className="px-4 py-3 font-sans text-right">
                Total US Remittance:
              </td>
              <td className="px-4 py-3 text-right">
                {formatMinor(taxSummary.totalGrossSalesMinor, taxSummary.currency)}
              </td>
              <td className="px-4 py-3 text-right">
                {formatMinor(taxSummary.totalExemptSalesMinor, taxSummary.currency)}
              </td>
              <td className="px-4 py-3 text-right">
                {formatMinor(taxSummary.totalTaxableSalesMinor, taxSummary.currency)}
              </td>
              <td className="px-4 py-3 text-right"></td>
              <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                {formatMinor(taxSummary.totalTaxCollectedMinor, taxSummary.currency)}
              </td>
            </tr>
          </tfoot>
        </TableFrame>
      )}
    </Screen>
  );
}
