import { describe, expect, it } from 'vitest';
import { UnitedStatesTaxReportService } from '../src/infrastructure/reports/united-states-tax-report.service';
import type { UsSalesTaxSourceTransaction } from '../src/domain/model/us-sales-tax-record';

describe('UnitedStatesTaxReportService', () => {
  const service = new UnitedStatesTaxReportService();

  it('aggregates gross, exempt, and collected taxes by jurisdiction', () => {
    const transactions: UsSalesTaxSourceTransaction[] = [
      {
        invoiceId: 'inv-us-1',
        issueDate: new Date('2026-11-01'),
        stateCode: 'FL',
        jurisdictionName: 'Miami-Dade County',
        grossAmountMinor: 10000n,
        isTaxExempt: false,
        taxRatePercentage: 7,
        taxAmountMinor: 700n,
        currency: 'USD',
      },
      {
        invoiceId: 'inv-us-2',
        issueDate: new Date('2026-11-05'),
        stateCode: 'FL',
        jurisdictionName: 'Miami-Dade County',
        grossAmountMinor: 5000n,
        isTaxExempt: true,
        taxRatePercentage: 7,
        taxAmountMinor: 0n,
        currency: 'USD',
      },
      {
        invoiceId: 'inv-us-3',
        issueDate: new Date('2026-11-10'),
        stateCode: 'TX',
        jurisdictionName: 'Harris County',
        grossAmountMinor: 20000n,
        isTaxExempt: false,
        taxRatePercentage: 8.25,
        taxAmountMinor: 1650n,
        currency: 'USD',
      },
    ];

    const report = service.buildUsSalesTaxSummary(transactions);

    expect(report.jurisdictions).toHaveLength(2);
    expect(report.totalGrossSalesMinor).toBe(35000n);
    expect(report.totalExemptSalesMinor).toBe(5000n);
    expect(report.totalTaxableSalesMinor).toBe(30000n);
    expect(report.totalTaxCollectedMinor).toBe(2350n);

    const fl = report.jurisdictions.find((j) => j.stateCode === 'FL');
    expect(fl).toBeDefined();
    expect(fl?.grossSalesMinor).toBe(15000n);
    expect(fl?.exemptSalesMinor).toBe(5000n);
    expect(fl?.taxableSalesMinor).toBe(10000n);
    expect(fl?.taxCollectedMinor).toBe(700n);
  });
});
