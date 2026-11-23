import { describe, expect, it } from 'vitest';
import {
  Account,
  AccountCode,
  type JournalEntry,
  type AccountRepository,
  type JournalEntryRepository,
} from '@corebiz/domain';
import { PostJournalEntryCommandHandler } from '../../src/accounting/commands/post-journal-entry.command';

export class MockAccountRepo implements AccountRepository {
  accounts = new Map<string, Account>();

  findById(_tenantId: string, id: string): Promise<Account | null> {
    return Promise.resolve(this.accounts.get(id) ?? null);
  }
  findByCode(_tenantId: string, _code: AccountCode): Promise<Account | null> {
    return Promise.resolve(null);
  }
  listByTenant(_tenantId: string): Promise<readonly Account[]> {
    return Promise.resolve(Array.from(this.accounts.values()));
  }
  save(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
    return Promise.resolve();
  }
}

export class MockJournalRepo implements JournalEntryRepository {
  saved: JournalEntry[] = [];
  nextNum = 1n;

  findById(_tenantId: string, id: string): Promise<JournalEntry | null> {
    return Promise.resolve(this.saved.find((e) => e.id === id) ?? null);
  }
  nextEntryNumber(_tenantId: string): Promise<bigint> {
    const num = this.nextNum;
    this.nextNum += 1n;
    return Promise.resolve(num);
  }
  save(entry: JournalEntry): Promise<void> {
    this.saved.push(entry);
    return Promise.resolve();
  }
  listByDateRange(
    _tenantId: string,
    _startDate: Date,
    _endDate: Date,
  ): Promise<readonly JournalEntry[]> {
    return Promise.resolve(this.saved);
  }
}

describe('PostJournalEntryCommandHandler Use Case', () => {
  it('posts balanced entry and increments sequence', async () => {
    const accountRepo = new MockAccountRepo();
    const journalRepo = new MockJournalRepo();

    const cashCode = AccountCode.create('1.1.01.01');
    const revenueCode = AccountCode.create('4.1.01.01');

    if (cashCode.ok && revenueCode.ok) {
      await accountRepo.save(
        new Account({
          id: 'acc-cash',
          tenantId: 'tenant-1',
          code: cashCode.value,
          name: 'Cash',
          category: 'ASSET',
          isReconcilable: true,
          isActive: true,
        }),
      );
      await accountRepo.save(
        new Account({
          id: 'acc-rev',
          tenantId: 'tenant-1',
          code: revenueCode.value,
          name: 'Revenue',
          category: 'REVENUE',
          isReconcilable: false,
          isActive: true,
        }),
      );

      const handler = new PostJournalEntryCommandHandler(accountRepo, journalRepo);

      const result = await handler.execute({
        id: 'je-01',
        tenantId: 'tenant-1',
        date: new Date('2026-11-23'),
        description: 'Manual cash sale',
        sourceType: 'MANUAL',
        lines: [
          {
            accountId: 'acc-cash',
            debitMinor: 5000n,
            creditMinor: 0n,
            currency: 'USD',
          },
          {
            accountId: 'acc-rev',
            debitMinor: 0n,
            creditMinor: 5000n,
            currency: 'USD',
          },
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entryNumber).toBe(1n);
        expect(journalRepo.saved).toHaveLength(1);
        expect(journalRepo.saved[0]?.totalDebit).toBe(5000n);
        expect(journalRepo.saved[0]?.totalCredit).toBe(5000n);
      }
    }
  });

  it('rejects unbalanced entry with UnbalancedEntry error', async () => {
    const accountRepo = new MockAccountRepo();
    const journalRepo = new MockJournalRepo();
    const cashCode = AccountCode.create('1.1.01.01');
    const revCode = AccountCode.create('4.1.01.01');

    if (cashCode.ok && revCode.ok) {
      await accountRepo.save(
        new Account({
          id: 'acc-cash',
          tenantId: 'tenant-1',
          code: cashCode.value,
          name: 'Cash',
          category: 'ASSET',
          isReconcilable: true,
          isActive: true,
        }),
      );
      await accountRepo.save(
        new Account({
          id: 'acc-rev',
          tenantId: 'tenant-1',
          code: revCode.value,
          name: 'Revenue',
          category: 'REVENUE',
          isReconcilable: false,
          isActive: true,
        }),
      );

      const handler = new PostJournalEntryCommandHandler(accountRepo, journalRepo);

      const result = await handler.execute({
        id: 'je-unbalanced',
        tenantId: 'tenant-1',
        date: new Date('2026-11-23'),
        description: 'Unbalanced attempt',
        sourceType: 'MANUAL',
        lines: [
          {
            accountId: 'acc-cash',
            debitMinor: 5000n,
            creditMinor: 0n,
            currency: 'USD',
          },
          {
            accountId: 'acc-rev',
            debitMinor: 0n,
            creditMinor: 4000n,
            currency: 'USD',
          },
        ],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('UnbalancedEntry');
      }
    }
  });
});
