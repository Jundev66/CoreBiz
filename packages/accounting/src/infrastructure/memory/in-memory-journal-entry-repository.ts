import { type JournalEntry, type JournalEntryRepository } from '../../domain/index';

export class InMemoryJournalEntryRepository implements JournalEntryRepository {
  private readonly entries = new Map<string, JournalEntry>();
  private readonly tenantSequence = new Map<string, bigint>();

  findById(tenantId: string, id: string): Promise<JournalEntry | null> {
    const entry = this.entries.get(id);
    if (!entry || entry.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(entry);
  }

  nextEntryNumber(tenantId: string): Promise<bigint> {
    const current = this.tenantSequence.get(tenantId) ?? 0n;
    const next = current + 1n;
    this.tenantSequence.set(tenantId, next);
    return Promise.resolve(next);
  }

  save(entry: JournalEntry): Promise<void> {
    this.entries.set(entry.id, entry);
    const current = this.tenantSequence.get(entry.tenantId) ?? 0n;
    if (entry.entryNumber > current) {
      this.tenantSequence.set(entry.tenantId, entry.entryNumber);
    }
    return Promise.resolve();
  }

  listByDateRange(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<readonly JournalEntry[]> {
    const result: JournalEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.tenantId === tenantId && entry.date >= startDate && entry.date <= endDate) {
        result.push(entry);
      }
    }
    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    return Promise.resolve(result);
  }

  clear(): void {
    this.entries.clear();
    this.tenantSequence.clear();
  }
}
