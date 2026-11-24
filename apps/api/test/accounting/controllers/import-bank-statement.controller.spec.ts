import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportBankStatementController } from '../../../src/modules/accounting/controllers/import-bank-statement.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('ImportBankStatementController', () => {
  let controller: ImportBankStatementController;
  let useCasesMock: {
    importBankStatement: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      importBankStatement: {
        execute: vi.fn().mockResolvedValue(
          ok({
            statementId: '018e245a-0000-7000-8000-000000000100',
            lineCount: 2,
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new ImportBankStatementController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
  });

  it('imports bank statement and returns statementId and lineCount', async () => {
    const response = await controller.run({
      bankAccountId: '018e245a-0000-7000-8000-000000000010',
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalance: '1000.00',
      endingBalance: '1500.00',
      lines: [
        {
          id: 'line-01',
          lineType: 'CREDIT',
          amount: '500.00',
          transactionDate: new Date('2026-11-15'),
          reference: 'DEP-100',
          description: 'Deposit',
        },
      ],
    });

    expect(response).toEqual({
      statementId: '018e245a-0000-7000-8000-000000000100',
      lineCount: 2,
    });
    expect(useCasesMock.importBankStatement.execute).toHaveBeenCalled();
  });
});
