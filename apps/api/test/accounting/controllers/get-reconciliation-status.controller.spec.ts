import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetReconciliationStatusController } from '../../../src/modules/accounting/controllers/get-reconciliation-status.controller';
import { ok, Money } from '@corebiz/domain';
import { BankStatement } from '@corebiz/accounting/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('GetReconciliationStatusController', () => {
  let controller: GetReconciliationStatusController;
  let useCasesMock: {
    getReconciliationStatus: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    const statementResult = BankStatement.create({
      id: 'stmt-001',
      tenantId: '018e245a-0000-7000-8000-000000000001',
      bankAccountId: 'acc-bank',
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalance: Money.fromMinor(100000n, 'USD'),
      endingBalance: Money.fromMinor(150000n, 'USD'),
      lines: [],
    });

    const stmt = statementResult.ok ? statementResult.value : ({} as unknown as BankStatement);

    useCasesMock = {
      getReconciliationStatus: {
        execute: vi.fn().mockResolvedValue(
          ok({
            statement: stmt,
            bankEndingBalance: Money.fromMinor(150000n, 'USD'),
            bookBalance: Money.fromMinor(150000n, 'USD'),
            reconciledBalance: Money.fromMinor(100000n, 'USD'),
            unreconciledDifference: Money.fromMinor(0n, 'USD'),
            totalLinesCount: 0,
            matchedLinesCount: 0,
            unmatchedLinesCount: 0,
            isFullyReconciled: true,
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new GetReconciliationStatusController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
  });

  it('returns formatted reconciliation status summary', async () => {
    const response = await controller.run('stmt-001');

    expect(response.bankEndingBalance).toBe('1500.00');
    expect(response.bookBalance).toBe('1500.00');
    expect(response.unreconciledDifference).toBe('0.00');
    expect(response.isFullyReconciled).toBe(true);
    expect(useCasesMock.getReconciliationStatus.execute).toHaveBeenCalled();
  });
});
