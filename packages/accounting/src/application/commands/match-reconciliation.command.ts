import {
  type BankStatementRepository,
  type JournalEntryRepository,
  ok,
  err,
  type Result,
} from '../../domain/index';

export interface ReconciliationMatchInput {
  readonly statementLineId: string;
  readonly journalEntryId: string;
  readonly journalEntryLineId?: string | undefined;
}

export interface MatchReconciliationCommand {
  readonly tenantId: string;
  readonly statementId: string;
  readonly matches: readonly ReconciliationMatchInput[];
}

export interface MatchReconciliationError {
  readonly kind:
    | 'StatementNotFound'
    | 'StatementAlreadyReconciled'
    | 'LineNotFound'
    | 'JournalEntryNotFound'
    | 'LineAmountMismatch'
    | 'LineAlreadyMatched';
  readonly details?: string | undefined;
}

export class MatchReconciliationCommandHandler {
  constructor(
    private readonly statementRepository: BankStatementRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(
    command: MatchReconciliationCommand,
  ): Promise<Result<{ statementId: string; matchedCount: number }, MatchReconciliationError>> {
    let statement = await this.statementRepository.findById(command.tenantId, command.statementId);
    if (!statement) {
      return err({ kind: 'StatementNotFound', details: command.statementId });
    }

    if (statement.status === 'RECONCILED') {
      return err({ kind: 'StatementAlreadyReconciled' });
    }

    let matchedCount = 0;

    for (const match of command.matches) {
      const line = statement.lines.find((l) => l.id === match.statementLineId);
      if (!line) {
        return err({ kind: 'LineNotFound', details: match.statementLineId });
      }

      if (line.status !== 'UNMATCHED') {
        return err({ kind: 'LineAlreadyMatched', details: match.statementLineId });
      }

      const journalEntry = await this.journalEntryRepository.findById(
        command.tenantId,
        match.journalEntryId,
      );
      if (!journalEntry) {
        return err({ kind: 'JournalEntryNotFound', details: match.journalEntryId });
      }

      const expectedBankLine = journalEntry.lines.find(
        (jl) => jl.accountId === statement?.bankAccountId,
      );
      if (!expectedBankLine) {
        return err({
          kind: 'LineAmountMismatch',
          details: 'No bank account line in journal entry',
        });
      }

      const expectedAmount =
        line.lineType === 'CREDIT'
          ? expectedBankLine.debit.minorUnits
          : expectedBankLine.credit.minorUnits;

      if (expectedAmount !== line.amount.minorUnits) {
        return err({
          kind: 'LineAmountMismatch',
          details: `Bank line ${line.amount.minorUnits} does not equal journal line ${expectedAmount}`,
        });
      }

      const updateResult = statement.matchLine(
        match.statementLineId,
        match.journalEntryId,
        match.journalEntryLineId,
      );
      if (!updateResult.ok) {
        return err({ kind: 'LineNotFound', details: match.statementLineId });
      }

      statement = updateResult.value;
      matchedCount++;
    }

    await this.statementRepository.save(statement);

    return ok({
      statementId: command.statementId,
      matchedCount,
    });
  }
}
