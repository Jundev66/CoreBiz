export interface PrinterStatusProps {
  readonly isOnline: boolean;
  readonly hasPaper: boolean;
  readonly isCoverOpen: boolean;
  readonly isFiscalMemoryFull: boolean;
  readonly serialNumber: string;
  readonly lastInvoiceNumber?: string | undefined;
  readonly lastControlNumber?: string | undefined;
  readonly lastReportZNumber?: number | undefined;
}

export class PrinterStatus {
  readonly isOnline: boolean;
  readonly hasPaper: boolean;
  readonly isCoverOpen: boolean;
  readonly isFiscalMemoryFull: boolean;
  readonly serialNumber: string;
  readonly lastInvoiceNumber?: string | undefined;
  readonly lastControlNumber?: string | undefined;
  readonly lastReportZNumber?: number | undefined;

  constructor(props: PrinterStatusProps) {
    this.isOnline = props.isOnline;
    this.hasPaper = props.hasPaper;
    this.isCoverOpen = props.isCoverOpen;
    this.isFiscalMemoryFull = props.isFiscalMemoryFull;
    this.serialNumber = props.serialNumber;
    this.lastInvoiceNumber = props.lastInvoiceNumber;
    this.lastControlNumber = props.lastControlNumber;
    this.lastReportZNumber = props.lastReportZNumber;
  }

  get isReady(): boolean {
    return this.isOnline && this.hasPaper && !this.isCoverOpen && !this.isFiscalMemoryFull;
  }
}
