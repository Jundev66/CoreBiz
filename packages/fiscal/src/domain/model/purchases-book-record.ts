import type { Currency } from '@corebiz/shared-kernel';

export interface PurchasesBookRecord {
  readonly operationNumber: number;
  readonly receiptDate: Date;
  readonly supplierTaxId: string;
  readonly supplierName: string;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly affectedDocumentNumber?: string | undefined;
  readonly documentType: 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  readonly totalPurchasesMinor: bigint;
  readonly exemptPurchasesMinor: bigint;
  readonly taxableBaseGeneralMinor: bigint;
  readonly taxGeneralMinor: bigint;
  readonly taxGeneralPercentage: number;
  readonly vatWithheldMinor: bigint;
  readonly withholdingVoucherNumber?: string | undefined;
  readonly currency: Currency;
}

export interface PurchasesBookSummary {
  readonly records: readonly PurchasesBookRecord[];
  readonly totalPurchasesMinor: bigint;
  readonly totalExemptMinor: bigint;
  readonly totalTaxableBaseMinor: bigint;
  readonly totalTaxCreditMinor: bigint;
  readonly totalWithheldMinor: bigint;
  readonly currency: Currency;
}

export interface PurchasesSourceTransaction {
  readonly receiptId: string;
  readonly receiptDate: Date;
  readonly supplierTaxId: string;
  readonly supplierName: string;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly affectedDocumentNumber?: string | undefined;
  readonly documentType: 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  readonly totalMinor: bigint;
  readonly exemptMinor: bigint;
  readonly taxableBaseGeneralMinor: bigint;
  readonly taxGeneralMinor: bigint;
  readonly taxGeneralPercentage: number;
  readonly vatWithheldMinor: bigint;
  readonly withholdingVoucherNumber?: string | undefined;
  readonly currency: Currency;
}
