import { type Currency, type Result, ok, err, Money } from '@corebiz/shared-kernel';
import {
  type AccountRepository,
  type JournalEntryRepository,
  type DisbursementRepository,
  type DisbursementCategory,
  JournalEntry,
  JournalEntryLine,
  Disbursement,
} from '../../domain/index';

export interface RecordDisbursementCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly date: Date;
  readonly category: DisbursementCategory;
  readonly beneficiary: string;
  readonly taxId?: string | undefined;
  readonly receiptNumber?: string | undefined;
  readonly sourceAccountId: string;
  readonly expenseAccountId: string;
  readonly currency: Currency;
  readonly amountMinor: bigint;
  readonly notes: string;
}

export interface RecordDisbursementResult {
  readonly disbursement: Disbursement;
  readonly journalEntry: JournalEntry;
}

export interface RecordDisbursementError {
  readonly kind:
    | 'SourceAccountNotFound'
    | 'ExpenseAccountNotFound'
    | 'SourceAccountNotAsset'
    | 'ExpenseAccountInvalidCategory'
    | 'IdenticalAccounts'
    | 'InvalidAmount'
    | 'EmptyBeneficiary'
    | 'JournalEntryError'
    | 'DisbursementValidationError';
  readonly details?: string | undefined;
}

export class RecordDisbursementCommandHandler {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly disbursementRepository: DisbursementRepository,
  ) {}

  async execute(
    command: RecordDisbursementCommand,
  ): Promise<Result<RecordDisbursementResult, RecordDisbursementError>> {
    if (command.sourceAccountId === command.expenseAccountId) {
      return err({ kind: 'IdenticalAccounts' });
    }

    if (command.amountMinor <= 0n) {
      return err({ kind: 'InvalidAmount', details: 'Disbursement amount must be positive' });
    }

    if (!command.beneficiary || command.beneficiary.trim() === '') {
      return err({ kind: 'EmptyBeneficiary', details: 'Beneficiary name is required' });
    }

    const sourceAccount = await this.accountRepository.findById(
      command.tenantId,
      command.sourceAccountId,
    );
    if (!sourceAccount) {
      return err({ kind: 'SourceAccountNotFound' });
    }
    if (sourceAccount.category !== 'ASSET') {
      return err({ kind: 'SourceAccountNotAsset' });
    }

    const expenseAccount = await this.accountRepository.findById(
      command.tenantId,
      command.expenseAccountId,
    );
    if (!expenseAccount) {
      return err({ kind: 'ExpenseAccountNotFound' });
    }
    if (expenseAccount.category !== 'EXPENSE' && expenseAccount.category !== 'COGS') {
      return err({ kind: 'ExpenseAccountInvalidCategory' });
    }

    const nextEntryNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);
    const nextDisbursementNumber = await this.disbursementRepository.nextDisbursementNumber(
      command.tenantId,
    );

    const zero = Money.zero(command.currency);
    const disbursementAmount = Money.fromMinor(command.amountMinor, command.currency);

    const expenseLineResult = JournalEntryLine.create(
      command.expenseAccountId,
      disbursementAmount,
      zero,
      `Gasto (${command.category}): ${command.beneficiary}`,
    );
    if (!expenseLineResult.ok) {
      return err({ kind: 'JournalEntryError', details: expenseLineResult.error.kind });
    }

    const sourceLineResult = JournalEntryLine.create(
      command.sourceAccountId,
      zero,
      disbursementAmount,
      `Pago de egreso: ${command.beneficiary}`,
    );
    if (!sourceLineResult.ok) {
      return err({ kind: 'JournalEntryError', details: sourceLineResult.error.kind });
    }

    const journalResult = JournalEntry.create({
      id: crypto.randomUUID(),
      tenantId: command.tenantId,
      entryNumber: nextEntryNumber,
      date: command.date,
      description: `Egreso operativo #${nextDisbursementNumber} [${command.category}]: ${command.beneficiary} (${command.notes})`,
      sourceType: 'DISBURSEMENT',
      sourceId: command.id,
      lines: [expenseLineResult.value, sourceLineResult.value],
    });

    if (!journalResult.ok) {
      return err({ kind: 'JournalEntryError', details: journalResult.error.kind });
    }

    const disbursementResult = Disbursement.create({
      id: command.id,
      tenantId: command.tenantId,
      disbursementNumber: nextDisbursementNumber,
      date: command.date,
      category: command.category,
      beneficiary: command.beneficiary,
      taxId: command.taxId,
      receiptNumber: command.receiptNumber,
      sourceAccountId: command.sourceAccountId,
      expenseAccountId: command.expenseAccountId,
      amount: disbursementAmount,
      notes: command.notes,
      journalEntryId: journalResult.value.id,
      createdAt: new Date(),
    });

    if (!disbursementResult.ok) {
      return err({ kind: 'DisbursementValidationError', details: disbursementResult.error.kind });
    }

    await this.journalEntryRepository.save(journalResult.value);
    await this.disbursementRepository.save(disbursementResult.value);

    return ok({
      disbursement: disbursementResult.value,
      journalEntry: journalResult.value,
    });
  }
}
