import {
  JournalEntry,
  JournalEntryLine,
  Money,
  type Currency,
  type JournalSourceType,
  type AccountRepository,
  type JournalEntryRepository,
  ok,
  err,
  type Result,
} from '@corebiz/domain';

export interface JournalLineInput {
  readonly accountId: string;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
  readonly currency: Currency;
  readonly memo?: string | undefined;
}

export interface PostJournalEntryCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly date: Date;
  readonly description: string;
  readonly sourceType: JournalSourceType;
  readonly sourceId?: string | undefined;
  readonly lines: readonly JournalLineInput[];
}

export interface PostJournalEntryError {
  readonly kind:
    'AccountNotFound' | 'AccountInactive' | 'InvalidJournalLine' | 'UnbalancedEntry' | 'EmptyLines';
  readonly details?: string | undefined;
}

export class PostJournalEntryCommandHandler {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(
    command: PostJournalEntryCommand,
  ): Promise<Result<{ entryId: string; entryNumber: bigint }, PostJournalEntryError>> {
    if (command.lines.length === 0) {
      return err({ kind: 'EmptyLines' });
    }

    const domainLines: JournalEntryLine[] = [];

    for (const input of command.lines) {
      const account = await this.accountRepository.findById(command.tenantId, input.accountId);
      if (!account) {
        return err({ kind: 'AccountNotFound', details: input.accountId });
      }
      if (!account.isActive) {
        return err({ kind: 'AccountInactive', details: input.accountId });
      }

      const debit = Money.fromMinor(input.debitMinor, input.currency);
      const credit = Money.fromMinor(input.creditMinor, input.currency);

      const lineResult = JournalEntryLine.create(input.accountId, debit, credit, input.memo);
      if (!lineResult.ok) {
        return err({ kind: 'InvalidJournalLine', details: lineResult.error.kind });
      }

      domainLines.push(lineResult.value);
    }

    const entryNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);

    const entryResult = JournalEntry.create({
      id: command.id,
      tenantId: command.tenantId,
      entryNumber,
      date: command.date,
      description: command.description,
      sourceType: command.sourceType,
      sourceId: command.sourceId,
      lines: domainLines,
    });

    if (!entryResult.ok) {
      return err({ kind: 'UnbalancedEntry', details: entryResult.error.kind });
    }

    await this.journalEntryRepository.save(entryResult.value);

    return ok({ entryId: entryResult.value.id, entryNumber });
  }
}
