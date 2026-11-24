import { describe, it, expect } from 'vitest';
import { HkaFiscalPrinterDriver } from '../src/infrastructure/hardware/hka-fiscal-printer.driver';
import { Money } from '@corebiz/shared-kernel';

describe('HkaFiscalPrinterDriver', () => {
  it('translates invoice models into compliant HKA protocol command frames', async () => {
    const driver = new HkaFiscalPrinterDriver('HKA-VEN-0099', 'VES');

    const commands = driver.buildHkaInvoiceCommands({
      invoiceNumber: '00000001',
      customerName: 'Empresa Demo C.A.',
      customerTaxId: 'J-12345678-9',
      customerAddress: 'Av Principal Edif Demo',
      lines: [
        {
          description: 'Servicio Contable General',
          quantity: 1,
          unitPrice: Money.fromMinor(50000n, 'VES'),
          taxRateTag: 'G',
          lineTotal: Money.fromMinor(50000n, 'VES'),
        },
      ],
      payments: [
        {
          method: 'TRANSFERENCIA',
          amount: Money.fromMinor(58000n, 'VES'),
        },
      ],
    });

    expect(commands).toContain('i01Empresa Demo C.A.');
    expect(commands).toContain('i02J-12345678-9');
    expect(commands).toContain('i03Av Principal Edif Demo');
    expect(commands[commands.length - 1]).toBe('199');

    const result = await driver.printFiscalInvoice({
      invoiceNumber: '00000001',
      customerName: 'Empresa Demo C.A.',
      customerTaxId: 'J-12345678-9',
      lines: [
        {
          description: 'Servicio Contable General',
          quantity: 1,
          unitPrice: Money.fromMinor(50000n, 'VES'),
          taxRateTag: 'G',
          lineTotal: Money.fromMinor(50000n, 'VES'),
        },
      ],
      payments: [
        {
          method: 'TRANSFERENCIA',
          amount: Money.fromMinor(58000n, 'VES'),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fiscalInvoiceNumber).toBe('00000001');
    expect(result.value.rawPayload).toContain('i01Empresa Demo C.A.');
  });
});
