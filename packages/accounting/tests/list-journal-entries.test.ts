import { describe, expect, it } from 'vitest';
import { JournalEntry, JournalEntryLine, ListJournalEntriesQueryHandler } from '../src';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { Money } from '@corebiz/shared-kernel';

describe('ListJournalEntriesQueryHandler', () => {
  it('returns mapped journal entries within date range', async () => {
    const repo = new InMemoryJournalEntryRepository();
    const lineDebit = JournalEntryLine.create(
      'acc-ar',
      Money.fromMinor(10000n, 'USD'),
      Money.fromMinor(0n, 'USD'),
    );
    const lineCredit = JournalEntryLine.create(
      'acc-rev',
      Money.fromMinor(0n, 'USD'),
      Money.fromMinor(10000n, 'USD'),
    );

    expect(lineDebit.ok).toBe(true);
    expect(lineCredit.ok).toBe(true);

    if (lineDebit.ok && lineCredit.ok) {
      const entry = JournalEntry.create({
        id: 'entry-1',
        tenantId: 'tenant-1',
        entryNumber: 1n,
        date: new Date('2026-11-23T12:00:00Z'),
        description: 'Invoice #001',
        sourceType: 'INVOICE',
        sourceId: 'inv-1',
        lines: [lineDebit.value, lineCredit.value],
      });

      expect(entry.ok).toBe(true);
      if (entry.ok) {
        await repo.save(entry.value);
      }
    }

    const handler = new ListJournalEntriesQueryHandler(repo);
    const result = await handler.execute({ tenantId: 'tenant-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.description).toBe('Invoice #001');
      expect(result.value[0]?.totalDebitMinor).toBe('10000');
      expect(result.value[0]?.totalCreditMinor).toBe('10000');
    }
  });
});
