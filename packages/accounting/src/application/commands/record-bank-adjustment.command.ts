import {
  type BankStatementRepository,
  type AccountRepository,
  type JournalEntryRepository,
  JournalEntry,
  JournalEntryLine,
  Money,
  ok,
  err,
  type Result,
} from '../../domain/index';

export interface RecordBankAdjustmentCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly statementId: string;
  readonly statementLineId: string;
  readonly counterpartAccountId: string;
  readonly description?: string | undefined;
}

export interface RecordBankAdjustmentError {
  readonly kind:
    | 'StatementNotFound'
    | 'StatementAlreadyReconciled'
    | 'LineNotFound'
    | 'LineAlreadyMatched'
    | 'CounterpartAccountNotFound'
    | 'InvalidJournalLine'
    | 'UnbalancedJournalEntry';
  readonly details?: string | undefined;
}

export class RecordBankAdjustmentCommandHandler {
  constructor(
    private readonly statementRepository: BankStatementRepository,
    private readonly accountRepository: AccountRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(
    command: RecordBankAdjustmentCommand,
  ): Promise<Result<{ journalEntryId: string; entryNumber: bigint }, RecordBankAdjustmentError>> {
    const statement = await this.statementRepository.findById(
      command.tenantId,
      command.statementId,
    );
    if (!statement) {
      return err({ kind: 'StatementNotFound', details: command.statementId });
    }

    if (statement.status === 'RECONCILED') {
      return err({ kind: 'StatementAlreadyReconciled' });
    }

    const line = statement.lines.find((l) => l.id === command.statementLineId);
    if (!line) {
      return err({ kind: 'LineNotFound', details: command.statementLineId });
    }

    if (line.status !== 'UNMATCHED') {
      return err({ kind: 'LineAlreadyMatched', details: command.statementLineId });
    }

    const counterpartAccount = await this.accountRepository.findById(
      command.tenantId,
      command.counterpartAccountId,
    );
    if (!counterpartAccount) {
      return err({ kind: 'CounterpartAccountNotFound', details: command.counterpartAccountId });
    }

    const bankAccountId = statement.bankAccountId;
    const currency = line.amount.currency;
    const amount = line.amount;
    const zero = Money.fromMinor(0n, currency);

    let counterpartLineResult;
    let bankLineResult;

    if (line.lineType === 'DEBIT') {
      counterpartLineResult = JournalEntryLine.create(
        command.counterpartAccountId,
        amount,
        zero,
        command.description ?? line.description,
      );
      bankLineResult = JournalEntryLine.create(bankAccountId, zero, amount, line.reference);
    } else {
      bankLineResult = JournalEntryLine.create(bankAccountId, amount, zero, line.reference);
      counterpartLineResult = JournalEntryLine.create(
        command.counterpartAccountId,
        zero,
        amount,
        command.description ?? line.description,
      );
    }

    if (!counterpartLineResult.ok || !bankLineResult.ok) {
      return err({ kind: 'InvalidJournalLine' });
    }

    const nextNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);

    const entryResult = JournalEntry.create({
      id: command.id,
      tenantId: command.tenantId,
      entryNumber: nextNumber,
      date: line.transactionDate,
      description: command.description ?? `Bank adjustment: ${line.description}`,
      sourceType: 'ADJUSTMENT',
      sourceId: line.id,
      lines: [counterpartLineResult.value, bankLineResult.value],
    });

    if (!entryResult.ok) {
      return err({ kind: 'UnbalancedJournalEntry' });
    }

    await this.journalEntryRepository.save(entryResult.value);

    const updatedStatementResult = statement.adjustLine(line.id, entryResult.value.id);
    if (!updatedStatementResult.ok) {
      return err({ kind: 'LineNotFound' });
    }

    await this.statementRepository.save(updatedStatementResult.value);

    return ok({
      journalEntryId: entryResult.value.id,
      entryNumber: nextNumber,
    });
  }
}
