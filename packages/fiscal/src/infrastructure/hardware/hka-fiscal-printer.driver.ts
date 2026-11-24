import { ok, type Result, type Currency } from '@corebiz/shared-kernel';
import { VirtualFiscalPrinterDriver } from './virtual-fiscal-printer.driver';
import type {
  FiscalPrinterPort,
  FiscalPrintInvoiceProps,
  PrinterError,
} from '../../domain/port/fiscal-printer.port';
import type { PrinterStatus } from '../../domain/model/printer-status';
import type { FiscalReportX } from '../../domain/model/fiscal-report-x';
import type { FiscalReportZ } from '../../domain/model/fiscal-report-z';

export class HkaFiscalPrinterDriver implements FiscalPrinterPort {
  private readonly simulator: VirtualFiscalPrinterDriver;

  constructor(
    readonly serialNumber = 'HKA99887766',
    readonly defaultCurrency: Currency = 'VES',
  ) {
    this.simulator = new VirtualFiscalPrinterDriver(serialNumber, defaultCurrency);
  }

  buildHkaInvoiceCommands(props: FiscalPrintInvoiceProps): string[] {
    const commands: string[] = [];

    commands.push(`i01${props.customerName.slice(0, 40)}`);
    commands.push(`i02${props.customerTaxId.slice(0, 15)}`);
    if (props.customerAddress) {
      commands.push(`i03${props.customerAddress.slice(0, 40)}`);
    }

    for (const line of props.lines) {
      const tag = line.taxRateTag === 'G' ? ' ' : line.taxRateTag === 'R' ? '!' : 'd';
      const qtyStr = Math.round(line.quantity * 1000)
        .toString()
        .padStart(8, '0');
      const priceStr = line.unitPrice.minorUnits.toString().padStart(10, '0');
      commands.push(`d0${priceStr}${qtyStr}${line.description.slice(0, 30)}${tag}`);
    }

    if (props.igtfAmount && props.igtfAmount.isPositive) {
      commands.push(`300${props.igtfAmount.minorUnits.toString().padStart(10, '0')}`);
    }

    for (const payment of props.payments) {
      commands.push(`201${payment.amount.minorUnits.toString().padStart(10, '0')}`);
    }

    commands.push('199');
    return commands;
  }

  getStatus(): Promise<PrinterStatus> {
    return this.simulator.getStatus();
  }

  async printFiscalInvoice(props: FiscalPrintInvoiceProps): Promise<
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
    const hkaCommands = this.buildHkaInvoiceCommands(props);
    const result = await this.simulator.printFiscalInvoice(props);

    if (!result.ok) {
      return result;
    }

    return ok({
      ...result.value,
      rawPayload: hkaCommands.join('\r\n'),
    });
  }

  printReportX(): Promise<Result<FiscalReportX, PrinterError>> {
    return this.simulator.printReportX();
  }

  printReportZ(): Promise<Result<FiscalReportZ, PrinterError>> {
    return this.simulator.printReportZ();
  }

  printNonFiscalDocument(
    lines: readonly string[],
  ): Promise<Result<{ printedAt: Date; lineCount: number; rawPayload?: string }, PrinterError>> {
    const nonFiscalCommands = lines.map((l) => `800${l}`);
    return this.simulator.printNonFiscalDocument(nonFiscalCommands);
  }
}
