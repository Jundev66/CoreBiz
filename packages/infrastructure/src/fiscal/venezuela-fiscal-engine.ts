import {
  Rif,
  Money,
  TaxRate,
  type FiscalJurisdictionPort,
  type JurisdictionCode,
  type Currency,
  type TaxCalculationLineInput,
  type TaxCalculationOutput,
  type CustomerTaxProfile,
  type RetentionCalculationInput,
  type RetentionCalculationOutput,
  type TaxBreakdownItem,
} from '@corebiz/domain';

export class VenezuelaFiscalEngine implements FiscalJurisdictionPort {
  readonly jurisdictionCode: JurisdictionCode = 'VE';
  readonly nationalCurrency: Currency = 'VES';

  validateTaxId(taxId: string): boolean {
    return Rif.create(taxId).ok;
  }

  formatTaxId(taxId: string): string {
    const parsed = Rif.create(taxId);
    return parsed.ok ? parsed.value.value() : taxId.trim().toUpperCase();
  }

  getTaxIdLabel(): string {
    return 'RIF';
  }

  calculateTaxes(
    lines: readonly TaxCalculationLineInput[],
    customerProfile: CustomerTaxProfile,
  ): TaxCalculationOutput {
    if (customerProfile.isTaxExempt) {
      return {
        taxes: [],
        totalTax: Money.zero(lines[0]?.baseAmount.currency ?? this.nationalCurrency),
      };
    }

    const items: TaxBreakdownItem[] = [];
    const currency = lines[0]?.baseAmount.currency ?? this.nationalCurrency;
    let totalTaxMinor = 0n;

    for (const line of lines) {
      let percentage = 16;
      let taxName = 'IVA General (16%)';

      if (line.taxTypeCode === 'IVA_REDUCIDO') {
        percentage = 8;
        taxName = 'IVA Reducido (8%)';
      } else if (line.taxTypeCode === 'EXENTO') {
        percentage = 0;
        taxName = 'Exento (0%)';
      }

      const rateResult = TaxRate.fromPercentage(percentage);
      if (rateResult.ok) {
        const taxMinor = rateResult.value.calculateTaxAmount(line.baseAmount.minorUnits);
        const taxAmount = Money.fromMinor(taxMinor, currency);
        totalTaxMinor += taxMinor;

        items.push({
          taxTypeCode: line.taxTypeCode,
          taxName,
          ratePercentage: percentage,
          baseAmount: line.baseAmount,
          taxAmount,
        });
      }
    }

    return {
      taxes: items,
      totalTax: Money.fromMinor(totalTaxMinor, currency),
    };
  }

  calculateRetentions(input: RetentionCalculationInput): RetentionCalculationOutput {
    const currency = input.invoiceTotalTax.currency;

    let vatRetentionMinor = 0n;
    if (input.customerProfile.isSpecialTaxpayer && input.invoiceTotalTax.isPositive) {
      const percentage = 75;
      vatRetentionMinor = (input.invoiceTotalTax.minorUnits * BigInt(percentage)) / 100n;
    }

    let igtfMinor = 0n;
    if (input.isForeignCurrencyPayment && input.paymentBaseAmount.isPositive) {
      const igtfPercentage = 3;
      igtfMinor = (input.paymentBaseAmount.minorUnits * BigInt(igtfPercentage)) / 100n;
    }

    const vatRetention = Money.fromMinor(vatRetentionMinor, currency);
    const igtf = Money.fromMinor(igtfMinor, input.paymentBaseAmount.currency);
    const totalWithheld = Money.fromMinor(vatRetentionMinor, currency);

    return {
      vatRetentionAmount: vatRetention,
      igtfAmount: igtf,
      totalWithheld,
    };
  }
}
