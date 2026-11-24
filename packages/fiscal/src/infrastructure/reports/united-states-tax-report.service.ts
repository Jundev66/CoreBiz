import type {
  UsSalesTaxJurisdictionSummary,
  UsSalesTaxReportSummary,
  UsSalesTaxSourceTransaction,
} from '../../domain/model/us-sales-tax-record';

export class UnitedStatesTaxReportService {
  buildUsSalesTaxSummary(
    transactions: readonly UsSalesTaxSourceTransaction[],
  ): UsSalesTaxReportSummary {
    const map = new Map<
      string,
      {
        stateCode: string;
        jurisdictionName: string;
        grossSalesMinor: bigint;
        exemptSalesMinor: bigint;
        taxableSalesMinor: bigint;
        taxRatePercentage: number;
        taxCollectedMinor: bigint;
      }
    >();

    let totalGrossSalesMinor = 0n;
    let totalExemptSalesMinor = 0n;
    let totalTaxableSalesMinor = 0n;
    let totalTaxCollectedMinor = 0n;
    const currency = transactions[0]?.currency ?? 'USD';

    for (const tx of transactions) {
      const key = `${tx.stateCode}:${tx.jurisdictionName}`;
      const entry = map.get(key) ?? {
        stateCode: tx.stateCode,
        jurisdictionName: tx.jurisdictionName,
        grossSalesMinor: 0n,
        exemptSalesMinor: 0n,
        taxableSalesMinor: 0n,
        taxRatePercentage: tx.taxRatePercentage,
        taxCollectedMinor: 0n,
      };

      entry.grossSalesMinor += tx.grossAmountMinor;
      totalGrossSalesMinor += tx.grossAmountMinor;

      if (tx.isTaxExempt) {
        entry.exemptSalesMinor += tx.grossAmountMinor;
        totalExemptSalesMinor += tx.grossAmountMinor;
      } else {
        entry.taxableSalesMinor += tx.grossAmountMinor;
        totalTaxableSalesMinor += tx.grossAmountMinor;
      }

      entry.taxCollectedMinor += tx.taxAmountMinor;
      totalTaxCollectedMinor += tx.taxAmountMinor;

      map.set(key, entry);
    }

    const jurisdictions: UsSalesTaxJurisdictionSummary[] = Array.from(map.values()).map((j) => ({
      ...j,
      currency,
    }));

    return {
      jurisdictions,
      totalGrossSalesMinor,
      totalExemptSalesMinor,
      totalTaxableSalesMinor,
      totalTaxCollectedMinor,
      currency,
    };
  }
}
