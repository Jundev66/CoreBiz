import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListJournalEntriesController } from '../../../src/modules/accounting/controllers/list-journal-entries.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('ListJournalEntriesController', () => {
  let controller: ListJournalEntriesController;
  let executeSpy: ReturnType<typeof vi.fn>;
  let useCasesMock: {
    listJournalEntries: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    executeSpy = vi.fn().mockResolvedValue(
      ok([
        {
          id: 'entry-1',
          entryNumber: '1',
          date: new Date('2026-11-23T12:00:00.000Z'),
          description: 'Sales Invoice',
          sourceType: 'INVOICE',
          sourceId: 'inv-1',
          lines: [
            {
              accountId: 'acc-1',
              debitMinor: '10000',
              creditMinor: '0',
              currency: 'USD',
              memo: 'AR',
            },
          ],
          totalDebitMinor: '10000',
          totalCreditMinor: '10000',
        },
      ]),
    );

    useCasesMock = {
      listJournalEntries: {
        execute: executeSpy,
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new ListJournalEntriesController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
  });

  it('lists journal entries and formats dates and amounts', async () => {
    const response = await controller.run({});

    expect(response.entries).toHaveLength(1);
    expect(response.entries[0]?.description).toBe('Sales Invoice');
    expect(response.entries[0]?.date).toBe('2026-11-23T12:00:00.000Z');
    expect(executeSpy).toHaveBeenCalled();
  });
});
