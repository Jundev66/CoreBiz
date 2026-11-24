import 'server-only';
import { get } from './client';

export interface AccountApiItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
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
