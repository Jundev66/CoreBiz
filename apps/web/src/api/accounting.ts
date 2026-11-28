import 'server-only';
import { get, send } from './client';
import type { AgingReportResponse, CreateAccountInput } from '@corebiz/contracts';

export interface AccountApiItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly parentId: string | null;
  readonly normalSide: string;
  readonly isReconcilable: boolean;
  readonly isActive: boolean;
}

export interface TrialBalanceAccountApiItem {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly normalSide: string;
  readonly totalDebitMinor: string;
  readonly totalCreditMinor: string;
  readonly netBalanceMinor: string;
}

export interface TrialBalanceApiResponse {
  readonly accounts: readonly TrialBalanceAccountApiItem[];
  readonly totalDebitMinor: string;
  readonly totalCreditMinor: string;
  readonly isBalanced: boolean;
}

export interface JournalEntryLineApiItem {
  readonly accountId: string;
  readonly debitMinor: string;
  readonly creditMinor: string;
  readonly currency: string;
  readonly memo: string | null;
}

export interface JournalEntryApiItem {
  readonly id: string;
  readonly entryNumber: string;
  readonly date: string;
  readonly description: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly lines: readonly JournalEntryLineApiItem[];
  readonly totalDebitMinor: string;
  readonly totalCreditMinor: string;
}

export async function listAccounts(fiscalCountry?: string): Promise<readonly AccountApiItem[]> {
  const query = fiscalCountry ? `?fiscalCountry=${encodeURIComponent(fiscalCountry)}` : '';
  const response = await get<{ accounts: readonly AccountApiItem[] }>(
    `/v1/accounting/accounts${query}`,
  );
  return response.accounts;
}

export async function createAccount(input: CreateAccountInput) {
  return send<{ accountId: string; code: string }>('POST', '/v1/accounting/accounts', input);
}

export async function getTrialBalance(
  startDate: Date,
  endDate: Date,
  currency: string,
): Promise<TrialBalanceApiResponse> {
  const query = `?startDate=${encodeURIComponent(startDate.toISOString())}&endDate=${encodeURIComponent(
    endDate.toISOString(),
  )}&currency=${encodeURIComponent(currency)}`;
  return get<TrialBalanceApiResponse>(`/v1/accounting/trial-balance${query}`);
}

export async function listJournalEntries(
  startDate?: Date,
  endDate?: Date,
): Promise<readonly JournalEntryApiItem[]> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate.toISOString());
  if (endDate) params.set('endDate', endDate.toISOString());
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await get<{ entries: readonly JournalEntryApiItem[] }>(
    `/v1/accounting/journal-entries${query}`,
  );
  return response.entries;
}

export async function getArAging(
  asOfDate?: string,
  customerId?: string,
  currency?: string,
): Promise<AgingReportResponse | null> {
  const params = new URLSearchParams();
  if (asOfDate) params.set('asOfDate', asOfDate);
  if (customerId) params.set('customerId', customerId);
  if (currency) params.set('currency', currency);
  const query = params.toString() ? `?${params.toString()}` : '';
  return get<AgingReportResponse>(`/v1/accounting/aging/ar${query}`);
}

export async function getApAging(
  asOfDate?: string,
  supplierId?: string,
  currency?: string,
): Promise<AgingReportResponse | null> {
  const params = new URLSearchParams();
  if (asOfDate) params.set('asOfDate', asOfDate);
  if (supplierId) params.set('supplierId', supplierId);
  if (currency) params.set('currency', currency);
  const query = params.toString() ? `?${params.toString()}` : '';
  return get<AgingReportResponse>(`/v1/accounting/aging/ap${query}`);
}

export interface DocumentPaymentEntryApiItem {
  readonly id: string;
  readonly direction: 'INBOUND' | 'OUTBOUND';
  readonly documentType: 'INVOICE' | 'PURCHASE';
  readonly documentId: string;
  readonly installmentId: string | null;
  readonly paymentNumber: string;
  readonly paymentMethod: string;
  readonly paymentCurrency: string;
  readonly paymentAmountMinor: string;
  readonly documentCurrency: string;
  readonly appliedAmountMinor: string;
  readonly exchangeRateScaled: string;
  readonly accountId: string;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly journalEntryId: string | null;
  readonly paymentDate: string;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly status: string;
}

export async function listDocumentPayments(
  direction?: 'INBOUND' | 'OUTBOUND',
): Promise<readonly DocumentPaymentEntryApiItem[]> {
  const query = direction ? `?direction=${direction}` : '';
  const response = await get<{ payments: readonly DocumentPaymentEntryApiItem[] }>(
    `/v1/accounting/document-payments${query}`,
  );
  return response.payments;
}
