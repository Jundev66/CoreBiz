import type { Currency, Money } from '@corebiz/shared-kernel';

export type JurisdictionCode = 'VE' | 'US';

export interface TaxCalculationLineInput {
  readonly lineId: string;
  readonly baseAmount: Money;
  readonly taxTypeCode: string;
}

export interface TaxBreakdownItem {
  readonly taxTypeCode: string;
  readonly taxName: string;
  readonly ratePercentage: number;
  readonly baseAmount: Money;
  readonly taxAmount: Money;
}

export interface TaxCalculationOutput {
  readonly taxes: readonly TaxBreakdownItem[];
  readonly totalTax: Money;
}

export interface CustomerTaxProfile {
  readonly taxId: string;
  readonly isSpecialTaxpayer: boolean;
  readonly isTaxExempt: boolean;
}

export interface RetentionCalculationInput {
  readonly invoiceTotalTax: Money;
  readonly customerProfile: CustomerTaxProfile;
  readonly paymentCurrency: Currency;
  readonly isForeignCurrencyPayment: boolean;
  readonly paymentBaseAmount: Money;
}

export interface RetentionCalculationOutput {
  readonly vatRetentionAmount: Money;
  readonly igtfAmount: Money;
  readonly totalWithheld: Money;
}

export interface FiscalJurisdictionPort {
  readonly jurisdictionCode: JurisdictionCode;
  readonly nationalCurrency: Currency;

  validateTaxId(taxId: string): boolean;
  formatTaxId(taxId: string): string;
  getTaxIdLabel(): string;

  calculateTaxes(
    lines: readonly TaxCalculationLineInput[],
    customerProfile: CustomerTaxProfile,
  ): TaxCalculationOutput;
  calculateRetentions(input: RetentionCalculationInput): RetentionCalculationOutput;
}
