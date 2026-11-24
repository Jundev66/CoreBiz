import type {
  SalesBookRecord,
  SalesBookSummary,
  SalesSourceTransaction,
} from '../../domain/model/sales-book-record';
import type {
  PurchasesBookRecord,
  PurchasesBookSummary,
  PurchasesSourceTransaction,
} from '../../domain/model/purchases-book-record';

export class VenezuelaFiscalBookService {
  buildSalesBook(transactions: readonly SalesSourceTransaction[]): SalesBookSummary {
    const sorted = [...transactions].sort((a, b) => a.issueDate.getTime() - b.issueDate.getTime());

    let totalSalesMinor = 0n;
    let totalExemptMinor = 0n;
    let totalTaxableBaseMinor = 0n;
    let totalTaxDebitMinor = 0n;
    let totalIgtfMinor = 0n;
    let totalWithheldMinor = 0n;
    const currency = sorted[0]?.currency ?? 'VES';

    const records: SalesBookRecord[] = sorted.map((tx, index) => {
      const isCreditNote = tx.documentType === 'NOTA_CREDITO';
      const factor = isCreditNote ? -1n : 1n;

      totalSalesMinor += tx.totalMinor * factor;
      totalExemptMinor += tx.exemptMinor * factor;
      totalTaxableBaseMinor += (tx.taxableBaseGeneralMinor + tx.taxableBaseReducedMinor) * factor;
      totalTaxDebitMinor += (tx.taxGeneralMinor + tx.taxReducedMinor) * factor;
      totalIgtfMinor += tx.igtfMinor * factor;
      totalWithheldMinor += tx.vatWithheldMinor * factor;

      return {
        operationNumber: index + 1,
        issueDate: tx.issueDate,
        customerTaxId: tx.customerTaxId,
        customerName: tx.customerName,
        documentNumber: tx.documentNumber,
        controlNumber: tx.controlNumber,
        affectedDocumentNumber: tx.affectedDocumentNumber,
        documentType: tx.documentType,
        totalSalesMinor: tx.totalMinor,
        exemptSalesMinor: tx.exemptMinor,
        taxableBaseGeneralMinor: tx.taxableBaseGeneralMinor,
        taxGeneralMinor: tx.taxGeneralMinor,
        taxGeneralPercentage: tx.taxGeneralPercentage,
        taxableBaseReducedMinor: tx.taxableBaseReducedMinor,
        taxReducedMinor: tx.taxReducedMinor,
        taxReducedPercentage: tx.taxReducedPercentage,
        igtfMinor: tx.igtfMinor,
        vatWithheldMinor: tx.vatWithheldMinor,
        withholdingVoucherNumber: tx.withholdingVoucherNumber,
        currency: tx.currency,
      };
    });

    return {
      records,
      totalSalesMinor,
      totalExemptMinor,
      totalTaxableBaseMinor,
      totalTaxDebitMinor,
      totalIgtfMinor,
      totalWithheldMinor,
      currency,
    };
  }

  buildPurchasesBook(transactions: readonly PurchasesSourceTransaction[]): PurchasesBookSummary {
    const sorted = [...transactions].sort(
      (a, b) => a.receiptDate.getTime() - b.receiptDate.getTime(),
    );

    let totalPurchasesMinor = 0n;
    let totalExemptMinor = 0n;
    let totalTaxableBaseMinor = 0n;
    let totalTaxCreditMinor = 0n;
    let totalWithheldMinor = 0n;
    const currency = sorted[0]?.currency ?? 'VES';

    const records: PurchasesBookRecord[] = sorted.map((tx, index) => {
      const isCreditNote = tx.documentType === 'NOTA_CREDITO';
      const factor = isCreditNote ? -1n : 1n;

      totalPurchasesMinor += tx.totalMinor * factor;
      totalExemptMinor += tx.exemptMinor * factor;
      totalTaxableBaseMinor += tx.taxableBaseGeneralMinor * factor;
      totalTaxCreditMinor += tx.taxGeneralMinor * factor;
      totalWithheldMinor += tx.vatWithheldMinor * factor;

      return {
        operationNumber: index + 1,
        receiptDate: tx.receiptDate,
        supplierTaxId: tx.supplierTaxId,
        supplierName: tx.supplierName,
        documentNumber: tx.documentNumber,
        controlNumber: tx.controlNumber,
        affectedDocumentNumber: tx.affectedDocumentNumber,
        documentType: tx.documentType,
        totalPurchasesMinor: tx.totalMinor,
        exemptPurchasesMinor: tx.exemptMinor,
        taxableBaseGeneralMinor: tx.taxableBaseGeneralMinor,
        taxGeneralMinor: tx.taxGeneralMinor,
        taxGeneralPercentage: tx.taxGeneralPercentage,
        vatWithheldMinor: tx.vatWithheldMinor,
        withholdingVoucherNumber: tx.withholdingVoucherNumber,
        currency: tx.currency,
      };
    });

    return {
      records,
      totalPurchasesMinor,
      totalExemptMinor,
      totalTaxableBaseMinor,
      totalTaxCreditMinor,
      totalWithheldMinor,
      currency,
    };
  }
}
