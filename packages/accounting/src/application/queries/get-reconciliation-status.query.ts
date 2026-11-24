import {
  type BankStatementRepository,
  type JournalEntryRepository,
  type BankStatement,
  Money,
  ok,
  err,
  type Result,
} from '../../domain/index';

export interface GetReconciliationStatusQuery {
  readonly tenantId: string;
  readonly statementId: string;
}

export interface ReconciliationStatusSummary {
  readonly statement: BankStatement;
  readonly bankEndingBalance: Money;
  readonly bookBalance: Money;
  readonly reconciledBalance: Money;
  readonly unreconciledDifference: Money;
  readonly totalLinesCount: number;
  readonly matchedLinesCount: number;
  readonly unmatchedLinesCount: number;
  readonly isFullyReconciled: boolean;
}

export interface GetReconciliationStatusError {
  readonly kind: 'StatementNotFound';
  readonly details?: string | undefined;
}

export class GetReconciliationStatusQueryHandler {
  constructor(
    private readonly statementRepository: BankStatementRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(
    query: GetReconciliationStatusQuery,
  ): Promise<Result<ReconciliationStatusSummary, GetReconciliationStatusError>> {
    const statement = await this.statementRepository.findById(query.tenantId, query.statementId);
    if (!statement) {
      return err({ kind: 'StatementNotFound', details: query.statementId });
    }

    const journalEntries = await this.journalEntryRepository.listByDateRange(
      query.tenantId,
      new Date('1970-01-01'),
      statement.endDate,
    );

    let bookBalanceMinor = 0n;
    for (const entry of journalEntries) {
      for (const line of entry.lines) {
        if (line.accountId === statement.bankAccountId) {
          bookBalanceMinor += line.debit.minorUnits;
          bookBalanceMinor -= line.credit.minorUnits;
        }
      }
    }

    const bookBalance = Money.fromMinor(bookBalanceMinor, statement.currency);
    const reconciledBalance = statement.calculateReconciledBalance();
    const differenceMinor = statement.endingBalance.minorUnits - bookBalance.minorUnits;
    const unreconciledDifference = Money.fromMinor(differenceMinor, statement.currency);

    const matchedLines = statement.calculateMatchedLines();
    const unmatchedLines = statement.calculateUnmatchedLines();

    const isFullyReconciled =
      statement.status === 'RECONCILED' || (unmatchedLines.length === 0 && differenceMinor === 0n);

    return ok({
      statement,
      bankEndingBalance: statement.endingBalance,
      bookBalance,
      reconciledBalance,
      unreconciledDifference,
      totalLinesCount: statement.lines.length,
      matchedLinesCount: matchedLines.length,
      unmatchedLinesCount: unmatchedLines.length,
      isFullyReconciled,
    });
  }
}
