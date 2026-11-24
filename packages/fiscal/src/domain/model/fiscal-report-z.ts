import { type Money } from '@corebiz/shared-kernel';

export interface FiscalReportZProps {
  readonly zReportNumber: number;
  readonly generatedAt: Date;
  readonly printerSerial: string;
  readonly totalDailySales: Money;
  readonly totalDailyTax: Money;
  readonly exemptSales: Money;
  readonly taxableBaseGeneral: Money;
  readonly taxGeneral: Money;
  readonly taxableBaseReduced: Money;
  readonly taxReduced: Money;
  readonly igtfTotal: Money;
  readonly invoiceCount: number;
  readonly creditNoteCount: number;
  readonly accumulatedFiscalMemorySales: Money;
  readonly accumulatedFiscalMemoryTax: Money;
}

export class FiscalReportZ {
  readonly zReportNumber: number;
  readonly generatedAt: Date;
  readonly printerSerial: string;
  readonly totalDailySales: Money;
  readonly totalDailyTax: Money;
  readonly exemptSales: Money;
  readonly taxableBaseGeneral: Money;
  readonly taxGeneral: Money;
  readonly taxableBaseReduced: Money;
  readonly taxReduced: Money;
  readonly igtfTotal: Money;
  readonly invoiceCount: number;
  readonly creditNoteCount: number;
  readonly accumulatedFiscalMemorySales: Money;
  readonly accumulatedFiscalMemoryTax: Money;

  constructor(props: FiscalReportZProps) {
    this.zReportNumber = props.zReportNumber;
    this.generatedAt = props.generatedAt;
    this.printerSerial = props.printerSerial;
    this.totalDailySales = props.totalDailySales;
    this.totalDailyTax = props.totalDailyTax;
    this.exemptSales = props.exemptSales;
    this.taxableBaseGeneral = props.taxableBaseGeneral;
    this.taxGeneral = props.taxGeneral;
    this.taxableBaseReduced = props.taxableBaseReduced;
    this.taxReduced = props.taxReduced;
    this.igtfTotal = props.igtfTotal;
    this.invoiceCount = props.invoiceCount;
    this.creditNoteCount = props.creditNoteCount;
    this.accumulatedFiscalMemorySales = props.accumulatedFiscalMemorySales;
    this.accumulatedFiscalMemoryTax = props.accumulatedFiscalMemoryTax;
  }
}
