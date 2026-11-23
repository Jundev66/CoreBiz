import { Invoice } from '../../src/invoicing/model/invoice';
import { InvoiceLine } from '../../src/invoicing/model/invoice-line';
import { Quantity } from '../../src/shared/value-objects/quantity';
import { Money, type Currency } from '../../src/shared/value-objects/money';
import { TaxRate } from '../../src/fiscal/value-objects/tax-rate';

export class InvoiceMother {
  static standard(
    unitPriceMinor = 10000n,
    taxPercentage = 16,
    currency: Currency = 'USD',
    tenantId = 'tenant-test-01',
    id = 'inv-test-01',
  ): Invoice {
    const qtyResult = Quantity.of(1);
    const taxRateResult = TaxRate.fromPercentage(taxPercentage);

    if (!qtyResult.ok || !taxRateResult.ok) {
      throw new Error('Failed to create quantity or tax rate');
    }

    const lineResult = InvoiceLine.create(
      'line-test-01',
      'Test Product Line',
      qtyResult.value,
      Money.fromMinor(unitPriceMinor, currency),
      taxRateResult.value,
    );

    if (!lineResult.ok) {
      throw new Error('Failed to create invoice line');
    }

    const invoiceResult = Invoice.create({
      id,
      tenantId,
      customerId: 'cust-test-01',
      documentType: 'STANDARD',
      documentNumber: 'FACT-TEST-001',
      issueDate: new Date('2026-11-23'),
      dueDate: new Date('2026-12-23'),
      lines: [lineResult.value],
    });

    if (!invoiceResult.ok) {
      throw new Error(`Failed to create invoice: ${JSON.stringify(invoiceResult.error)}`);
    }

    return invoiceResult.value;
  }
}
