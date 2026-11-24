import { ok, type Result } from '@corebiz/shared-kernel';
import type { JournalEntryRepository } from '../../domain/port/accounting-repository';

export interface ListJournalEntriesQuery {
  readonly tenantId: string;
  readonly startDate?: Date | undefined;
  readonly endDate?: Date | undefined;
}

export interface JournalEntryLineViewItem {
  readonly accountId: string;
  readonly debitMinor: string;
  readonly creditMinor: string;
  readonly currency: string;
  readonly memo?: string | undefined;
}

export interface JournalEntryViewItem {
  readonly id: string;
  readonly entryNumber: string;
  readonly date: Date;
  readonly description: string;
  readonly sourceType: string;
  readonly sourceId?: string | undefined;
  readonly lines: readonly JournalEntryLineViewItem[];
  readonly totalDebitMinor: string;
  readonly totalCreditMinor: string;
}

export class ListJournalEntriesQueryHandler {
  constructor(private readonly journalEntryRepository: JournalEntryRepository) {}

  async execute(
    query: ListJournalEntriesQuery,
  ): Promise<Result<readonly JournalEntryViewItem[], never>> {
    const start = query.startDate ?? new Date(0);
    const end = query.endDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const entries = await this.journalEntryRepository.listByDateRange(query.tenantId, start, end);

    const mapped: JournalEntryViewItem[] = entries.map((entry) => ({
      id: entry.id,
      entryNumber: entry.entryNumber.toString(),
      date: entry.date,
      description: entry.description,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      lines: entry.lines.map((line) => ({
        accountId: line.accountId,
        debitMinor: line.debit.minorUnits.toString(),
        creditMinor: line.credit.minorUnits.toString(),
        currency: line.debit.currency,
        memo: line.memo,
      })),
      totalDebitMinor: entry.totalDebit.toString(),
      totalCreditMinor: entry.totalCredit.toString(),
    }));

    return ok(mapped);
  }
}
