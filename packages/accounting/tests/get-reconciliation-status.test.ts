import { describe, it, expect, beforeEach } from 'vitest';
import { GetReconciliationStatusQueryHandler } from '../src/application/queries/get-reconciliation-status.query';
import { InMemoryBankStatementRepository } from '../src/infrastructure/memory/in-memory-bank-statement-repository';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { BankStatement } from '../src/domain/model/bank-statement';
import { BankStatementLine } from '../src/domain/model/bank-statement-line';
import { JournalEntry } from '../src/domain/model/journal-entry';
import { JournalEntryLine } from '../src/domain/model/journal-entry-line';
import { Money } from '@corebiz/shared-kernel';

describe('GetReconciliationStatusQueryHandler', () => {
  let statementRepo: InMemoryBankStatementRepository;
  let journalRepo: InMemoryJournalEntryRepository;
  let handler: GetReconciliationStatusQueryHandler;

  const tenantId = 'tenant-test-01';
  const bankAccountId = 'acc-bank-01';

  beforeEach(() => {
    statementRepo = new InMemoryBankStatementRepository();
    journalRepo = new InMemoryJournalEntryRepository();
    handler = new GetReconciliationStatusQueryHandler(statementRepo, journalRepo);
  });

  it('calculates GL book balance, reconciled balance and unreconciled difference', async () => {
    const lineResult = BankStatementLine.create({
      id: 'line-01',
      statementId: 'stmt-01',
      lineType: 'CREDIT',
      amount: Money.fromMinor(40000n, 'USD'),
      transactionDate: new Date('2026-11-10'),
      reference: 'WIRE-01',
      description: 'Wire In',
    });
    if (!lineResult.ok) return;

    const statementResult = BankStatement.create({
      id: 'stmt-01',
      tenantId,
      bankAccountId,
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalance: Money.fromMinor(10000n, 'USD'),
      endingBalance: Money.fromMinor(50000n, 'USD'),
      lines: [lineResult.value],
    });
    if (!statementResult.ok) return;
    await statementRepo.save(statementResult.value);

    const bankDebit = JournalEntryLine.create(
      bankAccountId,
      Money.fromMinor(50000n, 'USD'),
      Money.fromMinor(0n, 'USD'),
      'Bank balance line',
    );
    const revCredit = JournalEntryLine.create(
      'acc-rev',
      Money.fromMinor(0n, 'USD'),
      Money.fromMinor(50000n, 'USD'),
      'Revenue line',
    );
    if (!bankDebit.ok || !revCredit.ok) return;

    const entry = JournalEntry.create({
      id: 'entry-01',
      tenantId,
      entryNumber: 1n,
      date: new Date('2026-11-10'),
      description: 'Recorded sale deposit',
      sourceType: 'PAYMENT',
      lines: [bankDebit.value, revCredit.value],
    });
    if (!entry.ok) return;
    await journalRepo.save(entry.value);

    const statusResult = await handler.execute({
      tenantId,
      statementId: 'stmt-01',
    });

    expect(statusResult.ok).toBe(true);
    if (!statusResult.ok) return;

    expect(statusResult.value.bankEndingBalance.minorUnits).toBe(50000n);
    expect(statusResult.value.bookBalance.minorUnits).toBe(50000n);
    expect(statusResult.value.unreconciledDifference.minorUnits).toBe(0n);
    expect(statusResult.value.unmatchedLinesCount).toBe(1);
    expect(statusResult.value.matchedLinesCount).toBe(0);
  });
});
