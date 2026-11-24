import type { LocalSale } from '../db';
import {
  type FiscalPrinterPort,
  type FiscalPrintInvoiceProps,
  VirtualFiscalPrinterDriver,
  HkaFiscalPrinterDriver,
  EscPosPrinterDriver,
} from '@corebiz/fiscal';
import { Money, type Currency } from '@corebiz/domain';

export interface PrintResult {
  readonly success: boolean;
  readonly invoiceNumber?: string | undefined;
  readonly controlNumber?: string | undefined;
  readonly reportNumber?: number | undefined;
  readonly error?: string | undefined;
  readonly queuedOffline?: boolean | undefined;
}

export class HardwarePrinterService {
  private readonly veDriver: FiscalPrinterPort;
  private readonly usDriver: FiscalPrinterPort;
  private readonly virtualDriver: VirtualFiscalPrinterDriver;

  constructor() {
    this.veDriver = new HkaFiscalPrinterDriver('HKA-POS-DEMO', 'VES');
    this.usDriver = new EscPosPrinterDriver('ESC/POS POS Receipt Printer', 'USD');
    this.virtualDriver = new VirtualFiscalPrinterDriver('VIRTUAL-POS-01', 'USD');
  }

  getDriverForCountry(country: string): FiscalPrinterPort {
    if (country === 'VE') {
      return this.veDriver;
    }
    if (country === 'US') {
      return this.usDriver;
    }
    return this.virtualDriver;
  }

  async printSaleReceipt(sale: LocalSale): Promise<PrintResult> {
    const country = sale.country ?? 'VE';
    const driver = this.getDriverForCountry(country);
    const currency: Currency = country === 'VE' ? 'VES' : 'USD';

    const status = await driver.getStatus();
    if (!status.isReady) {
      return {
        success: false,
        queuedOffline: true,
        error: !status.hasPaper
          ? 'OutOfPaper'
          : !status.isOnline
            ? 'PrinterOffline'
            : 'PrinterError',
      };
    }

    const lines = sale.lines.map((l) => ({
      description: l.name,
      quantity: l.quantity,
      unitPrice: Money.fromMinor(BigInt(l.unitPriceMinor), currency),
      taxRateTag: 'G' as const,
      lineTotal: Money.fromMinor(BigInt(l.lineTotalMinor), currency),
    }));

    const payments = [
      {
        method: sale.paymentMethod,
        amount: Money.fromMinor(BigInt(sale.totalMinor), currency),
      },
    ];

    const printProps: FiscalPrintInvoiceProps = {
      invoiceNumber: sale.id.slice(0, 8),
      customerName: sale.customerName || 'Consumidor Final',
      customerTaxId: sale.customerDoc || (country === 'VE' ? 'V-00000000-0' : '00-0000000'),
      lines,
      payments,
    };

    const result = await driver.printFiscalInvoice(printProps);
    if (!result.ok) {
      return {
        success: false,
        error: result.error.kind,
      };
    }

    return {
      success: true,
      invoiceNumber: result.value.fiscalInvoiceNumber,
      controlNumber: result.value.fiscalControlNumber,
    };
  }

  async executeShiftAuditReportX(country = 'VE'): Promise<PrintResult> {
    const driver = this.getDriverForCountry(country);
    const result = await driver.printReportX();
    if (!result.ok) {
      return { success: false, error: result.error.kind };
    }
    return { success: true, reportNumber: result.value.reportNumber };
  }

  async executeDailyCloseReportZ(country = 'VE'): Promise<PrintResult> {
    const driver = this.getDriverForCountry(country);
    const result = await driver.printReportZ();
    if (!result.ok) {
      return { success: false, error: result.error.kind };
    }
    return { success: true, reportNumber: result.value.zReportNumber };
  }
}

export const hardwarePrinterService = new HardwarePrinterService();
