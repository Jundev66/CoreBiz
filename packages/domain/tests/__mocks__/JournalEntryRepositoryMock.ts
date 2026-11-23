import { expect, vi } from 'vitest';
import type { JournalEntryRepository } from '../../src/accounting/port/accounting-repository';
import type { JournalEntry } from '../../src/accounting/model/journal-entry';

export class JournalEntryRepositoryMock implements JournalEntryRepository {
  private readonly saveMock = vi.fn<(entry: JournalEntry) => Promise<void>>();
  private readonly findByIdMock =
    vi.fn<(tenantId: string, id: string) => Promise<JournalEntry | null>>();
  private readonly nextEntryNumberMock = vi.fn<(tenantId: string) => Promise<bigint>>();
  private readonly listByDateRangeMock =
    vi.fn<(tenantId: string, startDate: Date, endDate: Date) => Promise<readonly JournalEntry[]>>();

  async save(entry: JournalEntry): Promise<void> {
    await this.saveMock(entry);
  }

  async findById(tenantId: string, id: string): Promise<JournalEntry | null> {
    return this.findByIdMock(tenantId, id);
  }

  async nextEntryNumber(tenantId: string): Promise<bigint> {
    return this.nextEntryNumberMock(tenantId);
  }

  async listByDateRange(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<readonly JournalEntry[]> {
    return this.listByDateRangeMock(tenantId, startDate, endDate);
  }

  returnNextEntryNumber(entryNumber: bigint): void {
    this.nextEntryNumberMock.mockResolvedValue(entryNumber);
  }

  returnOnFindById(entry: JournalEntry | null): void {
    this.findByIdMock.mockResolvedValue(entry);
  }

  assertSaveHasBeenCalledWith(expectedEntry: JournalEntry): void {
    expect(this.saveMock).toHaveBeenCalledWith(expectedEntry);
  }
}
