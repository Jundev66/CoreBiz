import { JournalEntry } from '../../src/accounting/model/journal-entry';
import { JournalEntryLine } from '../../src/accounting/model/journal-entry-line';
import { Money, type Currency } from '../../src/shared/value-objects/money';

export class JournalEntryMother {
  static balanced(
    amountMinor = 10000n,
    currency: Currency = 'USD',
    tenantId = 'tenant-test-01',
    entryNumber = 1n,
  ): JournalEntry {
    const debitLineResult = JournalEntryLine.create(
      'acc-debit-01',
      Money.fromMinor(amountMinor, currency),
      Money.zero(currency),
      'Debit line',
    );
    const creditLineResult = JournalEntryLine.create(
      'acc-credit-01',
      Money.zero(currency),
      Money.fromMinor(amountMinor, currency),
      'Credit line',
    );

    if (!debitLineResult.ok || !creditLineResult.ok) {
      throw new Error('Failed to create journal lines');
    }

    const entryResult = JournalEntry.create({
      id: `entry-${entryNumber}`,
      tenantId,
      entryNumber,
      date: new Date('2026-11-23'),
      description: 'Balanced test journal entry',
      sourceType: 'INVOICE',
      sourceId: 'source-test-01',
      lines: [debitLineResult.value, creditLineResult.value],
    });

    if (!entryResult.ok) {
      throw new Error(`Failed to create balanced entry: ${JSON.stringify(entryResult.error)}`);
    }

    return entryResult.value;
  }
}
