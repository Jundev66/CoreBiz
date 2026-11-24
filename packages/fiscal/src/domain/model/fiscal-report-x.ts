import { type Money } from '@corebiz/shared-kernel';

export interface FiscalReportXProps {
  readonly reportNumber: number;
  readonly generatedAt: Date;
  readonly printerSerial: string;
  readonly totalSales: Money;
  readonly totalTax: Money;
  readonly exemptSales: Money;
  readonly taxableBaseGeneral: Money;
  readonly taxGeneral: Money;
  readonly taxableBaseReduced: Money;
  readonly taxReduced: Money;
  readonly igtfTotal: Money;
  readonly invoiceCount: number;
  readonly creditNoteCount: number;
}

export class FiscalReportX {
  readonly reportNumber: number;
  readonly generatedAt: Date;
  readonly printerSerial: string;
  readonly totalSales: Money;
  readonly totalTax: Money;
  readonly exemptSales: Money;
  readonly taxableBaseGeneral: Money;
  readonly taxGeneral: Money;
  readonly taxableBaseReduced: Money;
  readonly taxReduced: Money;
  readonly igtfTotal: Money;
  readonly invoiceCount: number;
  readonly creditNoteCount: number;

  constructor(props: FiscalReportXProps) {
    this.reportNumber = props.reportNumber;
    this.generatedAt = props.generatedAt;
    this.printerSerial = props.printerSerial;
    this.totalSales = props.totalSales;
    this.totalTax = props.totalTax;
    this.exemptSales = props.exemptSales;
    this.taxableBaseGeneral = props.taxableBaseGeneral;
    this.taxGeneral = props.taxGeneral;
    this.taxableBaseReduced = props.taxableBaseReduced;
    this.taxReduced = props.taxReduced;
    this.igtfTotal = props.igtfTotal;
    this.invoiceCount = props.invoiceCount;
    this.creditNoteCount = props.creditNoteCount;
  }
}
