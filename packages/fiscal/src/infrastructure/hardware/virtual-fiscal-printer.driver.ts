import { Money, ok, err, type Result, type Currency } from '@corebiz/shared-kernel';
import { PrinterStatus } from '../../domain/model/printer-status';
import { FiscalReportX } from '../../domain/model/fiscal-report-x';
import { FiscalReportZ } from '../../domain/model/fiscal-report-z';
import type {
  FiscalPrinterPort,
  FiscalPrintInvoiceProps,
  PrinterError,
} from '../../domain/port/fiscal-printer.port';

export class VirtualFiscalPrinterDriver implements FiscalPrinterPort {
  private invoiceCounter = 0;
  private controlCounter = 0;
  private zReportCounter = 0;
  private isOnline = true;
  private hasPaper = true;
  private isCoverOpen = false;
  private isMemoryFull = false;

  private dailySalesMinor = 0n;
  private dailyTaxMinor = 0n;
  private dailyExemptMinor = 0n;
  private dailyGeneralBaseMinor = 0n;
  private dailyGeneralTaxMinor = 0n;
  private dailyReducedBaseMinor = 0n;
  private dailyReducedTaxMinor = 0n;
  private dailyIgtfMinor = 0n;
  private dailyInvoiceCount = 0;
  private dailyCreditNoteCount = 0;

  private accumulatedMemorySalesMinor = 0n;
  private accumulatedMemoryTaxMinor = 0n;

  constructor(
    readonly serialNumber = 'HKA00012345',
    readonly defaultCurrency: Currency = 'VES',
  ) {}

  setOnline(online: boolean): void {
    this.isOnline = online;
  }

  setHasPaper(paper: boolean): void {
    this.hasPaper = paper;
  }

  setCoverOpen(open: boolean): void {
    this.isCoverOpen = open;
  }

  setMemoryFull(full: boolean): void {
    this.isMemoryFull = full;
  }

  getStatus(): Promise<PrinterStatus> {
    return Promise.resolve(
      new PrinterStatus({
        isOnline: this.isOnline,
        hasPaper: this.hasPaper,
        isCoverOpen: this.isCoverOpen,
        isFiscalMemoryFull: this.isMemoryFull,
        serialNumber: this.serialNumber,
        lastInvoiceNumber: this.invoiceCounter.toString().padStart(8, '0'),
        lastControlNumber: `00-${this.controlCounter.toString().padStart(8, '0')}`,
        lastReportZNumber: this.zReportCounter,
      }),
    );
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
      return Promise.resolve(err({ kind: 'PrinterOffline', details: 'Printer disconnected' }));
    }
    if (!this.hasPaper) {
      return Promise.resolve(err({ kind: 'OutOfPaper', details: 'Paper roll empty' }));
    }
    if (this.isCoverOpen) {
      return Promise.resolve(err({ kind: 'CoverOpen', details: 'Printer cover is open' }));
    }
    if (this.isMemoryFull) {
      return Promise.resolve(err({ kind: 'FiscalMemoryFull', details: 'Fiscal memory depleted' }));
    }

    this.invoiceCounter++;
    this.controlCounter++;
    this.dailyInvoiceCount++;

    let invoiceTotalMinor = 0n;
    for (const line of props.lines) {
      invoiceTotalMinor += line.lineTotal.minorUnits;
      if (line.taxRateTag === 'G') {
        this.dailyGeneralBaseMinor += line.lineTotal.minorUnits;
        const taxVal = (line.lineTotal.minorUnits * 16n) / 100n;
        this.dailyGeneralTaxMinor += taxVal;
        this.dailyTaxMinor += taxVal;
      } else if (line.taxRateTag === 'R') {
        this.dailyReducedBaseMinor += line.lineTotal.minorUnits;
        const taxVal = (line.lineTotal.minorUnits * 8n) / 100n;
        this.dailyReducedTaxMinor += taxVal;
        this.dailyTaxMinor += taxVal;
      } else {
        this.dailyExemptMinor += line.lineTotal.minorUnits;
      }
    }

    if (props.igtfAmount) {
      this.dailyIgtfMinor += props.igtfAmount.minorUnits;
    }

    this.dailySalesMinor += invoiceTotalMinor;

    const fiscalInvoiceNumber = this.invoiceCounter.toString().padStart(8, '0');
    const fiscalControlNumber = `00-${this.controlCounter.toString().padStart(8, '0')}`;
    const printedAt = new Date();

    const rawPayload = `[FISCAL INVOICE] Serial:${this.serialNumber} Inv:${fiscalInvoiceNumber} Ctrl:${fiscalControlNumber} Client:${props.customerName} RIF:${props.customerTaxId} Total:${invoiceTotalMinor}`;

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
    if (!this.isOnline) {
      return Promise.resolve(err({ kind: 'PrinterOffline' }));
    }
    if (!this.hasPaper) {
      return Promise.resolve(err({ kind: 'OutOfPaper' }));
    }

    const report = new FiscalReportX({
      reportNumber: this.zReportCounter + 1,
      generatedAt: new Date(),
      printerSerial: this.serialNumber,
      totalSales: Money.fromMinor(this.dailySalesMinor, this.defaultCurrency),
      totalTax: Money.fromMinor(this.dailyTaxMinor, this.defaultCurrency),
      exemptSales: Money.fromMinor(this.dailyExemptMinor, this.defaultCurrency),
      taxableBaseGeneral: Money.fromMinor(this.dailyGeneralBaseMinor, this.defaultCurrency),
      taxGeneral: Money.fromMinor(this.dailyGeneralTaxMinor, this.defaultCurrency),
      taxableBaseReduced: Money.fromMinor(this.dailyReducedBaseMinor, this.defaultCurrency),
      taxReduced: Money.fromMinor(this.dailyReducedTaxMinor, this.defaultCurrency),
      igtfTotal: Money.fromMinor(this.dailyIgtfMinor, this.defaultCurrency),
      invoiceCount: this.dailyInvoiceCount,
      creditNoteCount: this.dailyCreditNoteCount,
    });

    return Promise.resolve(ok(report));
  }

  printReportZ(): Promise<Result<FiscalReportZ, PrinterError>> {
    if (!this.isOnline) {
      return Promise.resolve(err({ kind: 'PrinterOffline' }));
    }
    if (!this.hasPaper) {
      return Promise.resolve(err({ kind: 'OutOfPaper' }));
    }

    this.zReportCounter++;
    this.accumulatedMemorySalesMinor += this.dailySalesMinor;
    this.accumulatedMemoryTaxMinor += this.dailyTaxMinor;

    const report = new FiscalReportZ({
      zReportNumber: this.zReportCounter,
      generatedAt: new Date(),
      printerSerial: this.serialNumber,
      totalDailySales: Money.fromMinor(this.dailySalesMinor, this.defaultCurrency),
      totalDailyTax: Money.fromMinor(this.dailyTaxMinor, this.defaultCurrency),
      exemptSales: Money.fromMinor(this.dailyExemptMinor, this.defaultCurrency),
      taxableBaseGeneral: Money.fromMinor(this.dailyGeneralBaseMinor, this.defaultCurrency),
      taxGeneral: Money.fromMinor(this.dailyGeneralTaxMinor, this.defaultCurrency),
      taxableBaseReduced: Money.fromMinor(this.dailyReducedBaseMinor, this.defaultCurrency),
      taxReduced: Money.fromMinor(this.dailyReducedTaxMinor, this.defaultCurrency),
      igtfTotal: Money.fromMinor(this.dailyIgtfMinor, this.defaultCurrency),
      invoiceCount: this.dailyInvoiceCount,
      creditNoteCount: this.dailyCreditNoteCount,
      accumulatedFiscalMemorySales: Money.fromMinor(
        this.accumulatedMemorySalesMinor,
        this.defaultCurrency,
      ),
      accumulatedFiscalMemoryTax: Money.fromMinor(
        this.accumulatedMemoryTaxMinor,
        this.defaultCurrency,
      ),
    });

    this.dailySalesMinor = 0n;
    this.dailyTaxMinor = 0n;
    this.dailyExemptMinor = 0n;
    this.dailyGeneralBaseMinor = 0n;
    this.dailyGeneralTaxMinor = 0n;
    this.dailyReducedBaseMinor = 0n;
    this.dailyReducedTaxMinor = 0n;
    this.dailyIgtfMinor = 0n;
    this.dailyInvoiceCount = 0;
    this.dailyCreditNoteCount = 0;

    return Promise.resolve(ok(report));
  }

  printNonFiscalDocument(
    lines: readonly string[],
  ): Promise<Result<{ printedAt: Date; lineCount: number; rawPayload?: string }, PrinterError>> {
    if (!this.isOnline) {
      return Promise.resolve(err({ kind: 'PrinterOffline' }));
    }
    if (!this.hasPaper) {
      return Promise.resolve(err({ kind: 'OutOfPaper' }));
    }

    return Promise.resolve(
      ok({
        printedAt: new Date(),
        lineCount: lines.length,
        rawPayload: lines.join('\n'),
      }),
    );
  }
}
