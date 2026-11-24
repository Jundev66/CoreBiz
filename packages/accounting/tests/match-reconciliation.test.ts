import { describe, it, expect, beforeEach } from 'vitest';
import { MatchReconciliationCommandHandler } from '../src/application/commands/match-reconciliation.command';
import { InMemoryBankStatementRepository } from '../src/infrastructure/memory/in-memory-bank-statement-repository';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { BankStatement } from '../src/domain/model/bank-statement';
import { BankStatementLine } from '../src/domain/model/bank-statement-line';
import { JournalEntry } from '../src/domain/model/journal-entry';
import { JournalEntryLine } from '../src/domain/model/journal-entry-line';
import { Money } from '@corebiz/shared-kernel';

describe('MatchReconciliationCommandHandler', () => {
  let statementRepo: InMemoryBankStatementRepository;
  let journalRepo: InMemoryJournalEntryRepository;
  let handler: MatchReconciliationCommandHandler;

  const tenantId = 'tenant-test-01';
  const bankAccountId = 'acc-bank-chase';

  beforeEach(() => {
    statementRepo = new InMemoryBankStatementRepository();
    journalRepo = new InMemoryJournalEntryRepository();
    handler = new MatchReconciliationCommandHandler(statementRepo, journalRepo);
  });

  it('matches statement credit deposit line with debit line in journal entry', async () => {
    const lineResult = BankStatementLine.create({
      id: 'line-dep-01',
      statementId: 'stmt-match-01',
      lineType: 'CREDIT',
      amount: Money.fromMinor(50000n, 'USD'),
      transactionDate: new Date('2026-11-15'),
      reference: 'REF-98765',
      description: 'Customer deposit',
    });
    if (!lineResult.ok) return;

    const statementResult = BankStatement.create({
      id: 'stmt-match-01',
      tenantId,
      bankAccountId,
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalance: Money.fromMinor(100000n, 'USD'),
      endingBalance: Money.fromMinor(150000n, 'USD'),
      lines: [lineResult.value],
    });
    if (!statementResult.ok) return;
    await statementRepo.save(statementResult.value);

    const bankDebitLine = JournalEntryLine.create(
      bankAccountId,
      Money.fromMinor(50000n, 'USD'),
      Money.fromMinor(0n, 'USD'),
      'Bank deposit debit',
    );
    const arCreditLine = JournalEntryLine.create(
      'acc-ar',
      Money.fromMinor(0n, 'USD'),
      Money.fromMinor(50000n, 'USD'),
      'Accounts receivable credit',
    );
    if (!bankDebitLine.ok || !arCreditLine.ok) return;

    const entryResult = JournalEntry.create({
      id: 'entry-pmt-01',
      tenantId,
      entryNumber: 101n,
      date: new Date('2026-11-15'),
      description: 'Customer payment recorded',
      sourceType: 'PAYMENT',
      sourceId: 'pmt-01',
      lines: [bankDebitLine.value, arCreditLine.value],
    });
    if (!entryResult.ok) return;
    await journalRepo.save(entryResult.value);

    const result = await handler.execute({
      tenantId,
      statementId: 'stmt-match-01',
      matches: [
        {
          statementLineId: 'line-dep-01',
          journalEntryId: 'entry-pmt-01',
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matchedCount).toBe(1);

    const updated = await statementRepo.findById(tenantId, 'stmt-match-01');
    expect(updated?.lines[0]?.status).toBe('MATCHED');
    expect(updated?.lines[0]?.matchedJournalEntryId).toBe('entry-pmt-01');
  });
});
