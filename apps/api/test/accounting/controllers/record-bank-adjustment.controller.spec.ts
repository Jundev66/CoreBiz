import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordBankAdjustmentController } from '../../../src/modules/accounting/controllers/record-bank-adjustment.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('RecordBankAdjustmentController', () => {
  let controller: RecordBankAdjustmentController;
  let useCasesMock: {
    recordBankAdjustment: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      recordBankAdjustment: {
        execute: vi.fn().mockResolvedValue(
          ok({
            journalEntryId: '018e245a-0000-7000-8000-000000000200',
            entryNumber: 15n,
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new RecordBankAdjustmentController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
  });

  it('records bank adjustment entry and returns entryId and stringified entryNumber', async () => {
    const response = await controller.run('stmt-001', {
      statementLineId: 'line-fee-01',
      counterpartAccountId: 'acc-bank-fee',
      description: 'Monthly Fee',
    });

    expect(response).toEqual({
      journalEntryId: '018e245a-0000-7000-8000-000000000200',
      entryNumber: '15',
    });
    expect(useCasesMock.recordBankAdjustment.execute).toHaveBeenCalled();
  });
});
