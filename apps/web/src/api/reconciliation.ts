import 'server-only';
import { get, send } from './client';
import type {
  ImportBankStatementDto,
  MatchReconciliationDto,
  RecordBankAdjustmentDto,
} from '@corebiz/contracts';

export interface BankStatementLineApiItem {
  readonly id: string;
  readonly lineType: 'DEBIT' | 'CREDIT';
  readonly amount: string;
  readonly transactionDate: string;
  readonly reference: string;
  readonly description: string;
  readonly status: 'UNMATCHED' | 'MATCHED' | 'ADJUSTED';
  readonly matchedJournalEntryId: string | null;
}

export interface BankStatementApiItem {
  readonly id: string;
  readonly bankAccountId: string;
  readonly currency: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly startingBalance: string;
  readonly endingBalance: string;
  readonly status: 'OPEN' | 'RECONCILED';
  readonly lines: readonly BankStatementLineApiItem[];
}

export interface BankStatementListItem {
  readonly id: string;
  readonly bankAccountId: string;
  readonly currency: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly startingBalance: string;
  readonly endingBalance: string;
  readonly status: 'OPEN' | 'RECONCILED';
  readonly linesCount: number;
  readonly unmatchedCount: number;
}

export interface ReconciliationStatusApiResponse {
  readonly statement: BankStatementApiItem;
  readonly bankEndingBalance: string;
  readonly bookBalance: string;
  readonly reconciledBalance: string;
  readonly unreconciledDifference: string;
  readonly totalLinesCount: number;
  readonly matchedLinesCount: number;
  readonly unmatchedLinesCount: number;
  readonly isFullyReconciled: boolean;
}

export async function listBankStatements(
  bankAccountId?: string,
): Promise<readonly BankStatementListItem[]> {
  const query = bankAccountId ? `?bankAccountId=${encodeURIComponent(bankAccountId)}` : '';
  const response = await get<{ statements: readonly BankStatementListItem[] }>(
    `/v1/accounting/bank-statements${query}`,
  );
  return response.statements;
}

export async function getReconciliationStatus(
  statementId: string,
): Promise<ReconciliationStatusApiResponse | null> {
  return get<ReconciliationStatusApiResponse>(
    `/v1/accounting/bank-statements/${encodeURIComponent(statementId)}/status`,
  );
}

export async function importBankStatement(data: ImportBankStatementDto) {
  return send<{ statementId: string; lineCount: number }>(
    'POST',
    '/v1/accounting/bank-statements/import',
    data,
  );
}

export async function matchReconciliation(statementId: string, data: MatchReconciliationDto) {
  return send<{ statementId: string; matchedCount: number }>(
    'POST',
    `/v1/accounting/bank-statements/${encodeURIComponent(statementId)}/match`,
    data,
  );
}

export async function recordBankAdjustment(statementId: string, data: RecordBankAdjustmentDto) {
  return send<{ journalEntryId: string; entryNumber: string }>(
    'POST',
    `/v1/accounting/bank-statements/${encodeURIComponent(statementId)}/adjust`,
    data,
  );
}
