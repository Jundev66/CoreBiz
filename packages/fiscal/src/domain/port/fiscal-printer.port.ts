import { type Money, type Result } from '@corebiz/shared-kernel';
import type { PrinterStatus } from '../model/printer-status';
import type { FiscalReportX } from '../model/fiscal-report-x';
import type { FiscalReportZ } from '../model/fiscal-report-z';

export interface FiscalPrintInvoiceLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly taxRateTag: 'G' | 'R' | 'E';
  readonly lineTotal: Money;
}

export interface FiscalPrintPayment {
  readonly method: string;
  readonly amount: Money;
}

export interface FiscalPrintInvoiceProps {
  readonly invoiceNumber: string;
  readonly controlNumber?: string | undefined;
  readonly customerName: string;
  readonly customerTaxId: string;
  readonly customerAddress?: string | undefined;
  readonly lines: readonly FiscalPrintInvoiceLine[];
  readonly payments: readonly FiscalPrintPayment[];
  readonly igtfAmount?: Money | undefined;
}

export interface PrinterError {
  readonly kind:
    | 'PrinterOffline'
    | 'OutOfPaper'
    | 'CoverOpen'
    | 'FiscalMemoryFull'
    | 'CommandRejected'
    | 'CommunicationTimeout';
  readonly details?: string | undefined;
}

export interface FiscalPrinterPort {
  getStatus(): Promise<PrinterStatus>;

  printFiscalInvoice(props: FiscalPrintInvoiceProps): Promise<
    Result<
      {
        fiscalInvoiceNumber: string;
        fiscalControlNumber: string;
        printedAt: Date;
        rawPayload?: string | undefined;
      },
      PrinterError
    >
  >;

  printReportX(): Promise<Result<FiscalReportX, PrinterError>>;

  printReportZ(): Promise<Result<FiscalReportZ, PrinterError>>;

  printNonFiscalDocument(
    lines: readonly string[],
  ): Promise<
    Result<{ printedAt: Date; lineCount: number; rawPayload?: string | undefined }, PrinterError>
  >;
}
