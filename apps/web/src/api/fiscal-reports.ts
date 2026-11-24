import 'server-only';
import { get } from './client';

export interface SalesBookRecordApiItem {
  readonly operationNumber: number;
  readonly issueDate: string;
  readonly customerTaxId: string;
  readonly customerName: string;
  readonly documentNumber: string;
  readonly controlNumber: string | null;
  readonly affectedDocumentNumber: string | null;
  readonly documentType: string;
  readonly totalSalesMinor: string;
  readonly exemptSalesMinor: string;
  readonly taxableBaseGeneralMinor: string;
  readonly taxGeneralMinor: string;
  readonly taxGeneralPercentage: number;
  readonly taxableBaseReducedMinor: string;
  readonly taxReducedMinor: string;
  readonly taxReducedPercentage: number;
  readonly igtfMinor: string;
  readonly vatWithheldMinor: string;
  readonly withholdingVoucherNumber: string | null;
  readonly currency: string;
}

export interface SalesBookApiResponse {
  readonly records: readonly SalesBookRecordApiItem[];
  readonly totalSalesMinor: string;
  readonly totalExemptMinor: string;
  readonly totalTaxableBaseMinor: string;
  readonly totalTaxDebitMinor: string;
  readonly totalIgtfMinor: string;
  readonly totalWithheldMinor: string;
  readonly currency: string;
}

export interface PurchasesBookRecordApiItem {
  readonly operationNumber: number;
  readonly receiptDate: string;
  readonly supplierTaxId: string;
  readonly supplierName: string;
  readonly documentNumber: string;
  readonly controlNumber: string | null;
  readonly affectedDocumentNumber: string | null;
  readonly documentType: string;
  readonly totalPurchasesMinor: string;
  readonly exemptPurchasesMinor: string;
  readonly taxableBaseGeneralMinor: string;
  readonly taxGeneralMinor: string;
  readonly taxGeneralPercentage: number;
  readonly vatWithheldMinor: string;
  readonly withholdingVoucherNumber: string | null;
  readonly currency: string;
}

export interface PurchasesBookApiResponse {
  readonly records: readonly PurchasesBookRecordApiItem[];
  readonly totalPurchasesMinor: string;
  readonly totalExemptMinor: string;
  readonly totalTaxableBaseMinor: string;
  readonly totalTaxCreditMinor: string;
  readonly totalWithheldMinor: string;
  readonly currency: string;
}

export interface UsSalesTaxJurisdictionApiItem {
  readonly stateCode: string;
  readonly jurisdictionName: string;
  readonly grossSalesMinor: string;
  readonly exemptSalesMinor: string;
  readonly taxableSalesMinor: string;
  readonly taxRatePercentage: number;
  readonly taxCollectedMinor: string;
  readonly currency: string;
}

export interface UsSalesTaxApiResponse {
  readonly jurisdictions: readonly UsSalesTaxJurisdictionApiItem[];
  readonly totalGrossSalesMinor: string;
  readonly totalExemptSalesMinor: string;
  readonly totalTaxableSalesMinor: string;
  readonly totalTaxCollectedMinor: string;
  readonly currency: string;
}

export async function getSalesBook(
  startDate?: Date,
  endDate?: Date,
): Promise<SalesBookApiResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate.toISOString());
  if (endDate) params.set('endDate', endDate.toISOString());
  const query = params.toString() ? `?${params.toString()}` : '';
  return get<SalesBookApiResponse>(`/v1/fiscal/reports/sales-book${query}`);
}

export async function getPurchasesBook(
  startDate?: Date,
  endDate?: Date,
): Promise<PurchasesBookApiResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate.toISOString());
  if (endDate) params.set('endDate', endDate.toISOString());
  const query = params.toString() ? `?${params.toString()}` : '';
  return get<PurchasesBookApiResponse>(`/v1/fiscal/reports/purchases-book${query}`);
}

export async function getUsTaxSummary(
  startDate?: Date,
  endDate?: Date,
): Promise<UsSalesTaxApiResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate.toISOString());
  if (endDate) params.set('endDate', endDate.toISOString());
  const query = params.toString() ? `?${params.toString()}` : '';
  return get<UsSalesTaxApiResponse>(`/v1/fiscal/reports/us-tax-summary${query}`);
}
