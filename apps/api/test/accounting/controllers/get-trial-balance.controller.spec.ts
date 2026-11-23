import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetTrialBalanceController } from '../../../src/modules/accounting/controllers/get-trial-balance.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('GetTrialBalanceController', () => {
  let controller: GetTrialBalanceController;
  let useCasesMock: {
    getTrialBalance: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      getTrialBalance: {
        execute: vi.fn().mockResolvedValue(
          ok({
            accounts: [
              {
                accountId: '018e245a-0000-7000-8000-000000000010',
                code: '1.1.01',
                name: 'Caja Principal',
                normalSide: 'DEBIT',
                totalDebitMinor: 5000n,
                totalCreditMinor: 0n,
                netBalanceMinor: 5000n,
              },
            ],
            totalDebitMinor: 5000n,
            totalCreditMinor: 5000n,
            isBalanced: true,
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new GetTrialBalanceController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('fetches trial balance and stringifies bigints', async () => {
    const query = {
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.000Z'),
      currency: 'USD' as const,
    };

    const response = await controller.run(query);

    expect(response).toEqual({
      accounts: [
        {
          accountId: '018e245a-0000-7000-8000-000000000010',
          code: '1.1.01',
          name: 'Caja Principal',
          normalSide: 'DEBIT',
          totalDebitMinor: '5000',
          totalCreditMinor: '0',
          netBalanceMinor: '5000',
        },
      ],
      totalDebitMinor: '5000',
      totalCreditMinor: '5000',
      isBalanced: true,
    });
  });
});
