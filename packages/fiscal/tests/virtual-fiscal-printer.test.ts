import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFiscalPrinterDriver } from '../src/infrastructure/hardware/virtual-fiscal-printer.driver';
import { Money } from '@corebiz/shared-kernel';

describe('VirtualFiscalPrinterDriver', () => {
  let printer: VirtualFiscalPrinterDriver;

  beforeEach(() => {
    printer = new VirtualFiscalPrinterDriver('HKA-TEST-001', 'VES');
  });

  it('prints sequential fiscal invoices and generates statutory control numbers', async () => {
    const result1 = await printer.printFiscalInvoice({
      invoiceNumber: '00000001',
      customerName: 'Cliente Demo 01',
      customerTaxId: 'J-12345678-9',
      lines: [
        {
          description: 'Producto General 16%',
          quantity: 1,
          unitPrice: Money.fromMinor(10000n, 'VES'),
          taxRateTag: 'G',
          lineTotal: Money.fromMinor(10000n, 'VES'),
        },
      ],
      payments: [
        {
          method: 'EFECTIVO',
          amount: Money.fromMinor(11600n, 'VES'),
        },
      ],
    });

    expect(result1.ok).toBe(true);
    if (!result1.ok) return;
    expect(result1.value.fiscalInvoiceNumber).toBe('00000001');
    expect(result1.value.fiscalControlNumber).toBe('00-00000001');

    const result2 = await printer.printFiscalInvoice({
      invoiceNumber: '00000002',
      customerName: 'Cliente Demo 02',
      customerTaxId: 'V-98765432-1',
      lines: [
        {
          description: 'Producto Exento',
          quantity: 2,
          unitPrice: Money.fromMinor(5000n, 'VES'),
          taxRateTag: 'E',
          lineTotal: Money.fromMinor(10000n, 'VES'),
        },
      ],
      payments: [
        {
          method: 'PAGO_MOVIL',
          amount: Money.fromMinor(10000n, 'VES'),
        },
      ],
    });

    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    expect(result2.value.fiscalInvoiceNumber).toBe('00000002');
    expect(result2.value.fiscalControlNumber).toBe('00-00000002');
  });

  it('handles offline and out-of-paper hardware errors gracefully', async () => {
    printer.setOnline(false);

    const offlineResult = await printer.printFiscalInvoice({
      invoiceNumber: '00000003',
      customerName: 'Cliente Offline',
      customerTaxId: 'J-00000000-0',
      lines: [],
      payments: [],
    });

    expect(offlineResult.ok).toBe(false);
    if (offlineResult.ok) return;
    expect(offlineResult.error.kind).toBe('PrinterOffline');

    printer.setOnline(true);
    printer.setHasPaper(false);

    const paperResult = await printer.printFiscalInvoice({
      invoiceNumber: '00000004',
      customerName: 'Cliente Sin Papel',
      customerTaxId: 'J-00000000-0',
      lines: [],
      payments: [],
    });

    expect(paperResult.ok).toBe(false);
    if (paperResult.ok) return;
    expect(paperResult.error.kind).toBe('OutOfPaper');
  });

  it('executes Reporte X and Reporte Z resetting daily accumulators into fiscal memory', async () => {
    await printer.printFiscalInvoice({
      invoiceNumber: '00000001',
      customerName: 'Cliente Z',
      customerTaxId: 'J-12345678-9',
      lines: [
        {
          description: 'Item Test',
          quantity: 1,
          unitPrice: Money.fromMinor(20000n, 'VES'),
          taxRateTag: 'G',
          lineTotal: Money.fromMinor(20000n, 'VES'),
        },
      ],
      payments: [{ method: 'EFECTIVO', amount: Money.fromMinor(23200n, 'VES') }],
    });

    const reportX = await printer.printReportX();
    expect(reportX.ok).toBe(true);
    if (!reportX.ok) return;
    expect(reportX.value.totalSales.minorUnits).toBe(20000n);
    expect(reportX.value.invoiceCount).toBe(1);

    const reportZ = await printer.printReportZ();
    expect(reportZ.ok).toBe(true);
    if (!reportZ.ok) return;
    expect(reportZ.value.zReportNumber).toBe(1);
    expect(reportZ.value.totalDailySales.minorUnits).toBe(20000n);
    expect(reportZ.value.accumulatedFiscalMemorySales.minorUnits).toBe(20000n);

    const reportXAfterZ = await printer.printReportX();
    expect(reportXAfterZ.ok).toBe(true);
    if (!reportXAfterZ.ok) return;
    expect(reportXAfterZ.value.totalSales.minorUnits).toBe(0n);
    expect(reportXAfterZ.value.invoiceCount).toBe(0);
  });
});
