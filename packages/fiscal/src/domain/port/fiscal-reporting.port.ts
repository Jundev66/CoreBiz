import type { SalesBookSummary, SalesSourceTransaction } from '../model/sales-book-record';
import type {
  PurchasesBookSummary,
  PurchasesSourceTransaction,
} from '../model/purchases-book-record';
import type {
  UsSalesTaxReportSummary,
  UsSalesTaxSourceTransaction,
} from '../model/us-sales-tax-record';

export interface FiscalReportingPort {
  buildSalesBook(transactions: readonly SalesSourceTransaction[]): SalesBookSummary;
  buildPurchasesBook(transactions: readonly PurchasesSourceTransaction[]): PurchasesBookSummary;
  buildUsSalesTaxSummary(
    transactions: readonly UsSalesTaxSourceTransaction[],
  ): UsSalesTaxReportSummary;
}
