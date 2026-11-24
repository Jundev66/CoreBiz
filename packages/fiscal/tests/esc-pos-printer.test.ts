import { describe, it, expect } from 'vitest';
import { EscPosPrinterDriver } from '../src/infrastructure/hardware/esc-pos-printer.driver';
import { Money } from '@corebiz/shared-kernel';

describe('EscPosPrinterDriver', () => {
  it('formats ESC/POS thermal receipt commands with customer and line items', async () => {
    const driver = new EscPosPrinterDriver('US-ESC-POS', 'USD');

    const result = await driver.printFiscalInvoice({
      invoiceNumber: '000101',
      customerName: 'John Doe Demo',
      customerTaxId: '12-3456789',
      lines: [
        {
          description: 'US Retail Item',
          quantity: 2,
          unitPrice: Money.fromMinor(1500n, 'USD'),
          taxRateTag: 'G',
          lineTotal: Money.fromMinor(3000n, 'USD'),
        },
      ],
      payments: [
        {
          method: 'CREDIT_CARD',
          amount: Money.fromMinor(3210n, 'USD'),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.fiscalInvoiceNumber).toBe('000001');
    expect(result.value.rawPayload).toContain('John Doe Demo');
    expect(result.value.rawPayload).toContain('US Retail Item');
    expect(result.value.rawPayload).toContain('Thank you for your business!');
  });
});
