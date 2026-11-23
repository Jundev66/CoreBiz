import { describe, it, expect, beforeEach } from 'vitest';
import { PostJournalEntryCommandHandler } from '../src/application/commands/post-journal-entry.command';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { AccountMother } from './mothers/AccountMother';

describe('PostJournalEntryCommandHandler', () => {
  let accountRepo: InMemoryAccountRepository;
  let journalRepo: InMemoryJournalEntryRepository;
  let handler: PostJournalEntryCommandHandler;

  const tenantId = 'tenant-test-01';

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    journalRepo = new InMemoryJournalEntryRepository();
    handler = new PostJournalEntryCommandHandler(accountRepo, journalRepo);
  });

  it('posts balanced entry and assigns incremental entry number', async () => {
    const cashAccount = AccountMother.asset('1.1.01.01', 'Cash', tenantId, 'acc-cash');
    const revenueAccount = AccountMother.revenue('4.1.01.01', 'Revenue', tenantId, 'acc-rev');
    await accountRepo.save(cashAccount);
    await accountRepo.save(revenueAccount);

    const result = await handler.execute({
      id: 'entry-post-01',
      tenantId,
      date: new Date('2026-11-23'),
      description: 'Customer payment receipt',
      sourceType: 'PAYMENT',
      sourceId: 'pay-001',
      lines: [
        {
          accountId: 'acc-cash',
          debitMinor: 25000n,
          creditMinor: 0n,
          currency: 'USD',
          memo: 'Cash debit',
        },
        {
          accountId: 'acc-rev',
          debitMinor: 0n,
          creditMinor: 25000n,
          currency: 'USD',
          memo: 'Revenue credit',
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entryId).toBe('entry-post-01');
    expect(result.value.entryNumber).toBe(1n);

    const savedEntry = await journalRepo.findById(tenantId, 'entry-post-01');
    expect(savedEntry).not.toBeNull();
    expect(savedEntry?.totalDebit).toBe(25000n);
    expect(savedEntry?.totalCredit).toBe(25000n);
  });

  it('returns AccountNotFound when account does not exist in repository', async () => {
    const result = await handler.execute({
      id: 'entry-post-02',
      tenantId,
      date: new Date(),
      description: 'Nonexistent account entry',
      sourceType: 'MANUAL',
      lines: [
        { accountId: 'acc-missing', debitMinor: 1000n, creditMinor: 0n, currency: 'USD' },
        { accountId: 'acc-cash', debitMinor: 0n, creditMinor: 1000n, currency: 'USD' },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('AccountNotFound');
    expect(result.error.details).toBe('acc-missing');
  });

  it('returns AccountInactive when account is flagged inactive', async () => {
    const inactiveAccount = AccountMother.create(
      '1.1.09.01',
      'Old Bank',
      'ASSET',
      tenantId,
      'acc-inactive',
      false,
    );
    const activeAccount = AccountMother.revenue('4.1.01.01', 'Sales', tenantId, 'acc-sales');
    await accountRepo.save(inactiveAccount);
    await accountRepo.save(activeAccount);

    const result = await handler.execute({
      id: 'entry-post-03',
      tenantId,
      date: new Date(),
      description: 'Inactive account posting',
      sourceType: 'MANUAL',
      lines: [
        { accountId: 'acc-inactive', debitMinor: 500n, creditMinor: 0n, currency: 'USD' },
        { accountId: 'acc-sales', debitMinor: 0n, creditMinor: 500n, currency: 'USD' },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('AccountInactive');
    expect(result.error.details).toBe('acc-inactive');
  });

  it('rejects unbalanced entry with UnbalancedEntry error', async () => {
    const cash = AccountMother.asset('1.1.01.01', 'Cash', tenantId, 'acc-cash');
    const sales = AccountMother.revenue('4.1.01.01', 'Sales', tenantId, 'acc-sales');
    await accountRepo.save(cash);
    await accountRepo.save(sales);

    const result = await handler.execute({
      id: 'entry-post-04',
      tenantId,
      date: new Date(),
      description: 'Unbalanced payload',
      sourceType: 'MANUAL',
      lines: [
        { accountId: 'acc-cash', debitMinor: 10000n, creditMinor: 0n, currency: 'USD' },
        { accountId: 'acc-sales', debitMinor: 0n, creditMinor: 8000n, currency: 'USD' },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('UnbalancedEntry');
  });
});
