import type { Currency } from '@corebiz/shared-kernel';

export interface SalesBookRecord {
  readonly operationNumber: number;
  readonly issueDate: Date;
  readonly customerTaxId: string;
  readonly customerName: string;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly affectedDocumentNumber?: string | undefined;
  readonly documentType: 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  readonly totalSalesMinor: bigint;
  readonly exemptSalesMinor: bigint;
  readonly taxableBaseGeneralMinor: bigint;
  readonly taxGeneralMinor: bigint;
  readonly taxGeneralPercentage: number;
  readonly taxableBaseReducedMinor: bigint;
  readonly taxReducedMinor: bigint;
  readonly taxReducedPercentage: number;
  readonly igtfMinor: bigint;
  readonly vatWithheldMinor: bigint;
  readonly withholdingVoucherNumber?: string | undefined;
  readonly currency: Currency;
}

export interface SalesBookSummary {
  readonly records: readonly SalesBookRecord[];
  readonly totalSalesMinor: bigint;
  readonly totalExemptMinor: bigint;
  readonly totalTaxableBaseMinor: bigint;
  readonly totalTaxDebitMinor: bigint;
  readonly totalIgtfMinor: bigint;
  readonly totalWithheldMinor: bigint;
  readonly currency: Currency;
}

export interface SalesSourceTransaction {
  readonly invoiceId: string;
  readonly issueDate: Date;
  readonly customerTaxId: string;
  readonly customerName: string;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly affectedDocumentNumber?: string | undefined;
  readonly documentType: 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  readonly totalMinor: bigint;
  readonly exemptMinor: bigint;
  readonly taxableBaseGeneralMinor: bigint;
  readonly taxGeneralMinor: bigint;
  readonly taxGeneralPercentage: number;
  readonly taxableBaseReducedMinor: bigint;
  readonly taxReducedMinor: bigint;
  readonly taxReducedPercentage: number;
  readonly igtfMinor: bigint;
  readonly vatWithheldMinor: bigint;
  readonly withholdingVoucherNumber?: string | undefined;
  readonly currency: Currency;
}
