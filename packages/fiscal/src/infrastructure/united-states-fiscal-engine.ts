import { Money, type Currency } from '@corebiz/shared-kernel';
import {
  Ein,
  TaxRate,
  type FiscalJurisdictionPort,
  type JurisdictionCode,
  type TaxCalculationLineInput,
  type TaxCalculationOutput,
  type CustomerTaxProfile,
  type RetentionCalculationInput,
  type RetentionCalculationOutput,
  type TaxBreakdownItem,
} from '../domain/index';

export class UnitedStatesFiscalEngine implements FiscalJurisdictionPort {
  readonly jurisdictionCode: JurisdictionCode = 'US';
  readonly nationalCurrency: Currency = 'USD';

  constructor(private readonly defaultSalesTaxRatePercentage: number = 7) {}

  validateTaxId(taxId: string): boolean {
    return Ein.create(taxId).ok;
  }

  formatTaxId(taxId: string): string {
    const parsed = Ein.create(taxId);
    return parsed.ok ? parsed.value.value() : taxId.trim();
  }

  getTaxIdLabel(): string {
    return 'EIN';
  }

  calculateTaxes(
    lines: readonly TaxCalculationLineInput[],
    customerProfile: CustomerTaxProfile,
  ): TaxCalculationOutput {
    const currency = lines[0]?.baseAmount.currency ?? this.nationalCurrency;

    if (customerProfile.isTaxExempt) {
      return {
        taxes: [],
        totalTax: Money.zero(currency),
      };
    }

    const rateResult = TaxRate.fromPercentage(this.defaultSalesTaxRatePercentage);
    if (!rateResult.ok) {
      return {
        taxes: [],
        totalTax: Money.zero(currency),
      };
    }

    const items: TaxBreakdownItem[] = [];
    let totalTaxMinor = 0n;

    for (const line of lines) {
      if (line.taxTypeCode === 'EXEMPT') {
        continue;
      }

      const taxMinor = rateResult.value.calculateTaxAmount(line.baseAmount.minorUnits);
      const taxAmount = Money.fromMinor(taxMinor, currency);
      totalTaxMinor += taxMinor;

      items.push({
        taxTypeCode: 'SALES_TAX',
        taxName: `US Sales Tax (${this.defaultSalesTaxRatePercentage}%)`,
        ratePercentage: this.defaultSalesTaxRatePercentage,
        baseAmount: line.baseAmount,
        taxAmount,
      });
    }

    return {
      taxes: items,
      totalTax: Money.fromMinor(totalTaxMinor, currency),
    };
  }

  calculateRetentions(input: RetentionCalculationInput): RetentionCalculationOutput {
    const currency = input.invoiceTotalTax.currency;
    return {
      vatRetentionAmount: Money.zero(currency),
      igtfAmount: Money.zero(input.paymentBaseAmount.currency),
      totalWithheld: Money.zero(currency),
    };
  }
}
