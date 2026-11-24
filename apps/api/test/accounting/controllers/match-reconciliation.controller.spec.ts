import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchReconciliationController } from '../../../src/modules/accounting/controllers/match-reconciliation.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('MatchReconciliationController', () => {
  let controller: MatchReconciliationController;
  let useCasesMock: {
    matchReconciliation: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      matchReconciliation: {
        execute: vi.fn().mockResolvedValue(
          ok({
            statementId: 'stmt-001',
            matchedCount: 1,
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new MatchReconciliationController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
  });

  it('matches reconciliation lines and returns matched count', async () => {
    const response = await controller.run('stmt-001', {
      matches: [
        {
          statementLineId: 'line-01',
          journalEntryId: 'entry-01',
        },
      ],
    });

    expect(response).toEqual({
      statementId: 'stmt-001',
      matchedCount: 1,
    });
    expect(useCasesMock.matchReconciliation.execute).toHaveBeenCalled();
  });
});
