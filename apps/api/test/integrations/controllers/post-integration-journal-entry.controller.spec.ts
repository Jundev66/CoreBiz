import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostIntegrationJournalEntryController } from '../../../src/modules/integrations/controllers/post-integration-journal-entry.controller';
import type { IntegrationJournalEntryInput } from '@corebiz/contracts';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('PostIntegrationJournalEntryController', () => {
  let controller: PostIntegrationJournalEntryController;
  let saveJournalEntrySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveJournalEntrySpy = vi.fn().mockResolvedValue(undefined);

    const runtimeMock = {
      accounts: {
        findById: vi.fn().mockImplementation((tenantId: string, accountId: string) => {
          return Promise.resolve({
            id: accountId,
            tenantId,
            code: '1010',
            name: 'Cash',
            type: 'asset',
            isActive: true,
          });
        }),
        save: vi.fn(),
        findByCode: vi.fn(),
        findByTenant: vi.fn(),
      },
      journalEntries: {
        save: saveJournalEntrySpy,
        nextEntryNumber: vi.fn().mockResolvedValue(42n),
        findById: vi.fn(),
        findByTenant: vi.fn(),
      },
      invoices: {} as never,
      uow: {} as never,
      queries: {} as never,
    } as unknown as Runtime;

    controller = new PostIntegrationJournalEntryController(runtimeMock);
  });

  it('posts balanced journal entry and returns entryId and stringified entryNumber', async () => {
    const input: IntegrationJournalEntryInput = {
      date: new Date('2026-11-23T12:00:00Z'),
      description: 'Payroll external disbursement',
      reference: 'EXT-PAYROLL-001',
      currency: 'USD',
      lines: [
        {
          accountId: '018e245a-0000-7000-8000-000000000001',
          debitMinor: '5000',
          creditMinor: '0',
          description: 'Salaries Expense',
        },
        {
          accountId: '018e245a-0000-7000-8000-000000000002',
          debitMinor: '0',
          creditMinor: '5000',
          description: 'Cash Disbursement',
        },
      ],
    };

    const res = await controller.run(undefined, input);

    expect(res.ok).toBe(true);
    expect(res.journalEntryId).toBeDefined();
    expect(res.entryNumber).toBe('42');
    expect(saveJournalEntrySpy).toHaveBeenCalled();
  });

  it('throws UnprocessableEntityException when journal entry is unbalanced', async () => {
    const input: IntegrationJournalEntryInput = {
      date: new Date('2026-11-23T12:00:00Z'),
      description: 'Unbalanced external entry',
      currency: 'USD',
      lines: [
        {
          accountId: '018e245a-0000-7000-8000-000000000001',
          debitMinor: '5000',
          creditMinor: '0',
        },
        {
          accountId: '018e245a-0000-7000-8000-000000000002',
          debitMinor: '0',
          creditMinor: '4000',
        },
      ],
    };

    await expect(controller.run(undefined, input)).rejects.toThrow();
  });
});
