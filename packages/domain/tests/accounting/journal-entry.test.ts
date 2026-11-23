import { describe, expect, it } from 'vitest';
import { Money } from '../../src/shared/value-objects/money';
import { JournalEntryLine } from '../../src/accounting/model/journal-entry-line';
import { JournalEntry } from '../../src/accounting/model/journal-entry';
import { JournalEntryMother } from './JournalEntryMother';

describe('JournalEntry Aggregate & Double-Entry Invariant', () => {
  it('creates balanced journal entry using Mother', () => {
    const entry = JournalEntryMother.balanced(11600n, 'USD');
    expect(entry.totalDebit).toBe(11600n);
    expect(entry.totalCredit).toBe(11600n);
    expect(entry.currency).toBe('USD');
  });

  it('rejects unbalanced journal entry', () => {
    const debitLine = JournalEntryLine.create(
      'acc-cash',
      Money.fromMinor(10000n, 'USD'),
      Money.zero('USD'),
    );
    const creditLine = JournalEntryLine.create(
      'acc-revenue',
      Money.zero('USD'),
      Money.fromMinor(9000n, 'USD'),
    );

    if (debitLine.ok && creditLine.ok) {
      const entryResult = JournalEntry.create({
        id: 'entry-unbalanced',
        tenantId: 'tenant-01',
        entryNumber: 2n,
        date: new Date('2026-11-23'),
        description: 'Unbalanced entry attempt',
        sourceType: 'MANUAL',
        lines: [debitLine.value, creditLine.value],
      });

      expect(entryResult.ok).toBe(false);
      if (!entryResult.ok) {
        expect(entryResult.error.kind).toBe('UnbalancedJournalEntry');
        expect(entryResult.error.discrepancy).toBe(1000n);
      }
    }
  });

  it('rejects journal line having both debit and credit', () => {
    const lineResult = JournalEntryLine.create(
      'acc-invalid',
      Money.fromMinor(500n, 'USD'),
      Money.fromMinor(500n, 'USD'),
    );
    expect(lineResult.ok).toBe(false);
    if (!lineResult.ok) {
      expect(lineResult.error.kind).toBe('InvalidJournalLineBothDebitAndCredit');
    }
  });

  it('rejects entry with fewer than two lines', () => {
    const debitLine = JournalEntryLine.create(
      'acc-cash',
      Money.fromMinor(1000n, 'USD'),
      Money.zero('USD'),
    );
    if (debitLine.ok) {
      const entryResult = JournalEntry.create({
        id: 'entry-single',
        tenantId: 'tenant-01',
        entryNumber: 3n,
        date: new Date('2026-11-23'),
        description: 'Single line attempt',
        sourceType: 'MANUAL',
        lines: [debitLine.value],
      });
      expect(entryResult.ok).toBe(false);
      if (!entryResult.ok) {
        expect(entryResult.error.kind).toBe('InsufficientJournalLines');
      }
    }
  });
});
