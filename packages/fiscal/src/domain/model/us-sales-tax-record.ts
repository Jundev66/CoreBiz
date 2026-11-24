import type { Currency } from '@corebiz/shared-kernel';

export interface UsSalesTaxJurisdictionSummary {
  readonly stateCode: string;
  readonly jurisdictionName: string;
  readonly grossSalesMinor: bigint;
  readonly exemptSalesMinor: bigint;
  readonly taxableSalesMinor: bigint;
  readonly taxRatePercentage: number;
  readonly taxCollectedMinor: bigint;
  readonly currency: Currency;
}

export interface UsSalesTaxReportSummary {
  readonly jurisdictions: readonly UsSalesTaxJurisdictionSummary[];
  readonly totalGrossSalesMinor: bigint;
  readonly totalExemptSalesMinor: bigint;
  readonly totalTaxableSalesMinor: bigint;
  readonly totalTaxCollectedMinor: bigint;
  readonly currency: Currency;
}

export interface UsSalesTaxSourceTransaction {
  readonly invoiceId: string;
  readonly issueDate: Date;
  readonly stateCode: string;
  readonly jurisdictionName: string;
  readonly grossAmountMinor: bigint;
  readonly isTaxExempt: boolean;
  readonly taxRatePercentage: number;
  readonly taxAmountMinor: bigint;
  readonly currency: Currency;
}
