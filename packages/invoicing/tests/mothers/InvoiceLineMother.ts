import { InvoiceLine } from '../../src/domain/model/invoice-line';
import { Quantity, Money, type Currency } from '@corebiz/shared-kernel';
import { TaxRate } from '@corebiz/fiscal/domain';

export class InvoiceLineMother {
  static standard(
    unitPriceMinor = 10000n,
    taxPercentage = 16,
    currency: Currency = 'USD',
    id = 'line-test-01',
    description = 'Standard Consulting Service',
  ): InvoiceLine {
    const qtyResult = Quantity.of(1);
    const taxRateResult = TaxRate.fromPercentage(taxPercentage);
    if (!qtyResult.ok || !taxRateResult.ok) {
      throw new Error('Failed to create quantity or tax rate');
    }
    const lineResult = InvoiceLine.create(
      id,
      description,
      qtyResult.value,
      Money.fromMinor(unitPriceMinor, currency),
      taxRateResult.value,
    );
    if (!lineResult.ok) {
      throw new Error('Failed to create invoice line');
    }
    return lineResult.value;
  }
}
