import { describe, it, expect } from 'vitest';
import { JournalEntry } from '../src/domain/model/journal-entry';
import { JournalEntryLine } from '../src/domain/model/journal-entry-line';
import { Money } from '@corebiz/shared-kernel';
import { JournalEntryMother } from './mothers/JournalEntryMother';

describe('JournalEntry', () => {
  it('constructs balanced journal entry successfully', () => {
    const entry = JournalEntryMother.balanced(15000n, 'USD');
    expect(entry.totalDebit).toBe(15000n);
    expect(entry.totalCredit).toBe(15000n);
    expect(entry.currency).toBe('USD');
  });

  it('rejects journal entry with fewer than 2 lines', () => {
    const singleLine = JournalEntryLine.create(
      'acc-01',
      Money.fromMinor(1000n, 'USD'),
      Money.zero('USD'),
    );
    expect(singleLine.ok).toBe(true);
    if (!singleLine.ok) return;

    const result = JournalEntry.create({
      id: 'entry-01',
      tenantId: 'tenant-test',
      entryNumber: 1n,
      date: new Date(),
      description: 'Single line test',
      sourceType: 'MANUAL',
      lines: [singleLine.value],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('InsufficientJournalLines');
  });

  it('rejects unbalanced journal entry and returns exact discrepancy', () => {
    const debitLine = JournalEntryLine.create(
      'acc-01',
      Money.fromMinor(10000n, 'USD'),
      Money.zero('USD'),
    );
    const creditLine = JournalEntryLine.create(
      'acc-02',
      Money.zero('USD'),
      Money.fromMinor(9000n, 'USD'),
    );

    expect(debitLine.ok).toBe(true);
    expect(creditLine.ok).toBe(true);
    if (!debitLine.ok || !creditLine.ok) return;

    const result = JournalEntry.create({
      id: 'entry-02',
      tenantId: 'tenant-test',
      entryNumber: 2n,
      date: new Date(),
      description: 'Unbalanced entry',
      sourceType: 'MANUAL',
      lines: [debitLine.value, creditLine.value],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('UnbalancedJournalEntry');
    expect(result.error.discrepancy).toBe(1000n);
    expect(result.error.totalDebits).toBe(10000n);
    expect(result.error.totalCredits).toBe(9000n);
  });

  it('rejects currency mismatch between lines in the same entry', () => {
    const lineUsd = JournalEntryLine.create(
      'acc-01',
      Money.fromMinor(5000n, 'USD'),
      Money.zero('USD'),
    );
    const lineVes = JournalEntryLine.create(
      'acc-02',
      Money.zero('VES'),
      Money.fromMinor(5000n, 'VES'),
    );

    expect(lineUsd.ok).toBe(true);
    expect(lineVes.ok).toBe(true);
    if (!lineUsd.ok || !lineVes.ok) return;

    const result = JournalEntry.create({
      id: 'entry-03',
      tenantId: 'tenant-test',
      entryNumber: 3n,
      date: new Date(),
      description: 'Cross currency entry',
      sourceType: 'MANUAL',
      lines: [lineUsd.value, lineVes.value],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('JournalEntryCurrencyMismatch');
  });

  it('rejects line with both debit and credit positive', () => {
    const result = JournalEntryLine.create(
      'acc-01',
      Money.fromMinor(100n, 'USD'),
      Money.fromMinor(100n, 'USD'),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('InvalidJournalLineBothDebitAndCredit');
  });
});
