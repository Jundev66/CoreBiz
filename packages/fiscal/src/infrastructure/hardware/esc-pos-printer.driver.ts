import { ok, err, type Result, type Currency, Money } from '@corebiz/shared-kernel';
import { PrinterStatus } from '../../domain/model/printer-status';
import { FiscalReportX } from '../../domain/model/fiscal-report-x';
import { FiscalReportZ } from '../../domain/model/fiscal-report-z';
import type {
  FiscalPrinterPort,
  FiscalPrintInvoiceProps,
  PrinterError,
} from '../../domain/port/fiscal-printer.port';

export class EscPosPrinterDriver implements FiscalPrinterPort {
  private receiptCounter = 0;
  private isOnline = true;
  private hasPaper = true;

  constructor(
    readonly printerName = 'ESC/POS Thermal Receipt Printer',
    readonly currency: Currency = 'USD',
  ) {}

  getStatus(): Promise<PrinterStatus> {
    return Promise.resolve(
      new PrinterStatus({
        isOnline: this.isOnline,
        hasPaper: this.hasPaper,
        isCoverOpen: false,
        isFiscalMemoryFull: false,
        serialNumber: 'ESCPOS-USB-01',
        lastInvoiceNumber: this.receiptCounter.toString().padStart(6, '0'),
      }),
    );
  }

  buildEscPosCommands(props: FiscalPrintInvoiceProps): string {
    const ESC = '\x1B';
    const GS = '\x1D';

    let buffer = '';
    buffer += `${ESC}@`;
    buffer += `${ESC}a\x01`;
    buffer += `${ESC}E\x01RECEIPT\n${ESC}E\x00`;
    buffer += `Customer: ${props.customerName}\n`;
    buffer += `Tax ID / EIN: ${props.customerTaxId}\n`;
    buffer += '--------------------------------\n';
    buffer += `${ESC}a\x00`;

    for (const line of props.lines) {
      buffer += `${line.description} x${line.quantity}  ${line.lineTotal.toString()}\n`;
    }

    buffer += '--------------------------------\n';
    for (const pmt of props.payments) {
      buffer += `PAYMENT ${pmt.method}: ${pmt.amount.toString()}\n`;
    }

    buffer += `${ESC}a\x01Thank you for your business!\n`;
    buffer += `${GS}V\x00`;

    return buffer;
  }

  printFiscalInvoice(props: FiscalPrintInvoiceProps): Promise<
    Result<
      {
        fiscalInvoiceNumber: string;
        fiscalControlNumber: string;
        printedAt: Date;
        rawPayload?: string;
      },
      PrinterError
    >
  > {
    if (!this.isOnline) {
      return Promise.resolve(err({ kind: 'PrinterOffline' }));
    }
    if (!this.hasPaper) {
      return Promise.resolve(err({ kind: 'OutOfPaper' }));
    }

    this.receiptCounter++;
    const fiscalInvoiceNumber = this.receiptCounter.toString().padStart(6, '0');
    const fiscalControlNumber = `US-${fiscalInvoiceNumber}`;
    const printedAt = new Date();
    const rawPayload = this.buildEscPosCommands(props);

    return Promise.resolve(
      ok({
        fiscalInvoiceNumber,
        fiscalControlNumber,
        printedAt,
        rawPayload,
      }),
    );
  }

  printReportX(): Promise<Result<FiscalReportX, PrinterError>> {
    const report = new FiscalReportX({
      reportNumber: 1,
      generatedAt: new Date(),
      printerSerial: 'ESCPOS-01',
      totalSales: Money.zero(this.currency),
      totalTax: Money.zero(this.currency),
      exemptSales: Money.zero(this.currency),
      taxableBaseGeneral: Money.zero(this.currency),
      taxGeneral: Money.zero(this.currency),
      taxableBaseReduced: Money.zero(this.currency),
      taxReduced: Money.zero(this.currency),
      igtfTotal: Money.zero(this.currency),
      invoiceCount: this.receiptCounter,
      creditNoteCount: 0,
    });
    return Promise.resolve(ok(report));
  }

  printReportZ(): Promise<Result<FiscalReportZ, PrinterError>> {
    const report = new FiscalReportZ({
      zReportNumber: 1,
      generatedAt: new Date(),
      printerSerial: 'ESCPOS-01',
      totalDailySales: Money.zero(this.currency),
      totalDailyTax: Money.zero(this.currency),
      exemptSales: Money.zero(this.currency),
      taxableBaseGeneral: Money.zero(this.currency),
      taxGeneral: Money.zero(this.currency),
      taxableBaseReduced: Money.zero(this.currency),
      taxReduced: Money.zero(this.currency),
      igtfTotal: Money.zero(this.currency),
      invoiceCount: this.receiptCounter,
      creditNoteCount: 0,
      accumulatedFiscalMemorySales: Money.zero(this.currency),
      accumulatedFiscalMemoryTax: Money.zero(this.currency),
    });
    return Promise.resolve(ok(report));
  }

  printNonFiscalDocument(
    lines: readonly string[],
  ): Promise<Result<{ printedAt: Date; lineCount: number; rawPayload?: string }, PrinterError>> {
    return Promise.resolve(
      ok({
        printedAt: new Date(),
        lineCount: lines.length,
        rawPayload: lines.join('\n'),
      }),
    );
  }
}
