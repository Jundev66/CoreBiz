import { describe, it, expect, beforeEach } from 'vitest';
import { GetTrialBalanceQueryHandler } from '../src/application/queries/get-trial-balance.query';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { AccountMother } from './mothers/AccountMother';
import { JournalEntryLine } from '../src/domain/model/journal-entry-line';
import { JournalEntry } from '../src/domain/model/journal-entry';
import { Money } from '@corebiz/shared-kernel';

describe('GetTrialBalanceQueryHandler', () => {
  let accountRepo: InMemoryAccountRepository;
  let journalRepo: InMemoryJournalEntryRepository;
  let handler: GetTrialBalanceQueryHandler;

  const tenantId = 'tenant-test-01';

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    journalRepo = new InMemoryJournalEntryRepository();
    handler = new GetTrialBalanceQueryHandler(accountRepo, journalRepo);
  });

  it('computes balanced trial balance for given date range and currency', async () => {
    const cash = AccountMother.asset('1.1.01.01', 'Cash', tenantId, 'acc-cash');
    const sales = AccountMother.revenue('4.1.01.01', 'Sales', tenantId, 'acc-sales');
    await accountRepo.save(cash);
    await accountRepo.save(sales);

    const line1 = JournalEntryLine.create(
      'acc-cash',
      Money.fromMinor(12000n, 'USD'),
      Money.zero('USD'),
    );
    const line2 = JournalEntryLine.create(
      'acc-sales',
      Money.zero('USD'),
      Money.fromMinor(12000n, 'USD'),
    );
    expect(line1.ok && line2.ok).toBe(true);
    if (!line1.ok || !line2.ok) return;

    const entry = JournalEntry.create({
      id: 'entry-tb-01',
      tenantId,
      entryNumber: 1n,
      date: new Date('2026-11-15'),
      description: 'Cash sale',
      sourceType: 'INVOICE',
      lines: [line1.value, line2.value],
    });
    expect(entry.ok).toBe(true);
    if (!entry.ok) return;

    await journalRepo.save(entry.value);

    const result = await handler.execute({
      tenantId,
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      currency: 'USD',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.isBalanced).toBe(true);
    expect(result.value.totalDebitMinor).toBe(12000n);
    expect(result.value.totalCreditMinor).toBe(12000n);
    expect(result.value.accounts.length).toBe(2);

    const cashItem = result.value.accounts.find((a) => a.accountId === 'acc-cash');
    expect(cashItem?.totalDebitMinor).toBe(12000n);
    expect(cashItem?.netBalanceMinor).toBe(12000n);

    const salesItem = result.value.accounts.find((a) => a.accountId === 'acc-sales');
    expect(salesItem?.totalCreditMinor).toBe(12000n);
    expect(salesItem?.netBalanceMinor).toBe(12000n);
  });
});
