import { describe, expect, it } from 'vitest';
import { Account, AccountCode, JournalEntry, JournalEntryLine, Money } from '@corebiz/domain';
import { GetTrialBalanceQueryHandler } from '../../src/accounting/queries/get-trial-balance.query';
import { MockAccountRepo, MockJournalRepo } from './post-journal-entry.test';

describe('GetTrialBalanceQueryHandler Use Case', () => {
  it('calculates trial balance with balanced debit and credit totals', async () => {
    const accountRepo = new MockAccountRepo();
    const journalRepo = new MockJournalRepo();

    const cashCode = AccountCode.create('1.1.01.01');
    const revCode = AccountCode.create('4.1.01.01');

    if (cashCode.ok && revCode.ok) {
      await accountRepo.save(
        new Account({
          id: 'acc-1',
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
          id: 'acc-2',
          tenantId: 'tenant-1',
          code: revCode.value,
          name: 'Sales Revenue',
          category: 'REVENUE',
          isReconcilable: false,
          isActive: true,
        }),
      );

      const l1 = JournalEntryLine.create(
        'acc-1',
        Money.fromMinor(10000n, 'USD'),
        Money.zero('USD'),
      );
      const l2 = JournalEntryLine.create(
        'acc-2',
        Money.zero('USD'),
        Money.fromMinor(10000n, 'USD'),
      );

      if (l1.ok && l2.ok) {
        const entry = JournalEntry.create({
          id: 'je-1',
          tenantId: 'tenant-1',
          entryNumber: 1n,
          date: new Date('2026-11-23'),
          description: 'Initial entry',
          sourceType: 'INVOICE',
          lines: [l1.value, l2.value],
        });

        if (entry.ok) {
          await journalRepo.save(entry.value);
        }
      }

      const handler = new GetTrialBalanceQueryHandler(accountRepo, journalRepo);
      const result = await handler.execute({
        tenantId: 'tenant-1',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        currency: 'USD',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isBalanced).toBe(true);
        expect(result.value.totalDebitMinor).toBe(10000n);
        expect(result.value.totalCreditMinor).toBe(10000n);
        expect(result.value.accounts).toHaveLength(2);
      }
    }
  });
});
