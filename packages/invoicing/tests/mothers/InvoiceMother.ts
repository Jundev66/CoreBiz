import { Invoice } from '../../src/domain/model/invoice';
import { InvoiceLineMother } from './InvoiceLineMother';
import { type Currency } from '@corebiz/shared-kernel';

export class InvoiceMother {
  static standard(
    unitPriceMinor = 10000n,
    taxPercentage = 16,
    currency: Currency = 'USD',
    tenantId = 'tenant-test-01',
    id = 'inv-test-01',
  ): Invoice {
    const line = InvoiceLineMother.standard(unitPriceMinor, taxPercentage, currency);
    const invoiceResult = Invoice.create({
      id,
      tenantId,
      customerId: 'cust-test-01',
      documentType: 'STANDARD',
      documentNumber: 'FACT-TEST-001',
      issueDate: new Date('2026-11-23'),
      dueDate: new Date('2026-12-23'),
      lines: [line],
    });

    if (!invoiceResult.ok) {
      throw new Error(`Failed to create invoice: ${JSON.stringify(invoiceResult.error)}`);
    }

    return invoiceResult.value;
  }

  static withMultipleLines(
    tenantId = 'tenant-test-01',
    id = 'inv-multi-01',
    currency: Currency = 'USD',
  ): Invoice {
    const line1 = InvoiceLineMother.standard(10000n, 16, currency, 'l-1', 'Item 1');
    const line2 = InvoiceLineMother.standard(5000n, 0, currency, 'l-2', 'Item 2');
    const invoiceResult = Invoice.create({
      id,
      tenantId,
      customerId: 'cust-test-01',
      documentType: 'STANDARD',
      documentNumber: 'FACT-MULTI-001',
      issueDate: new Date('2026-11-23'),
      dueDate: new Date('2026-12-23'),
      lines: [line1, line2],
    });

    if (!invoiceResult.ok) {
      throw new Error('Failed to create multi-line invoice');
    }

    return invoiceResult.value;
  }
}
