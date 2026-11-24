import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunForexRevaluationController } from '../../../src/modules/accounting/controllers/run-forex-revaluation.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('RunForexRevaluationController', () => {
  let controller: RunForexRevaluationController;
  let useCasesMock: {
    runForexRevaluation: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      runForexRevaluation: {
        execute: vi.fn().mockResolvedValue(
          ok({
            entryId: '018e245a-0000-7000-8000-000000000300',
            entryNumber: 25n,
            totalGainMinor: 250000n,
            totalLossMinor: 0n,
            netDeltaMinor: 250000n,
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new RunForexRevaluationController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
  });

  it('runs forex revaluation and returns formatted gains, losses and entry details', async () => {
    const response = await controller.run({
      revaluationDate: new Date('2026-11-30'),
      functionalCurrency: 'VES',
      gainAccountId: 'acc-gain-01',
      lossAccountId: 'acc-loss-01',
      positions: [
        {
          accountId: 'acc-ar-01',
          accountCode: '1.1.02.01',
          accountName: 'AR USD',
          positionType: 'ASSET',
          foreignCurrency: 'USD',
          foreignAmount: '1000.00',
          historicalRate: '36.00',
          closingRate: '38.50',
        },
      ],
    });

    expect(response).toEqual({
      entryId: '018e245a-0000-7000-8000-000000000300',
      entryNumber: '25',
      totalGain: '2500.00',
      totalLoss: '0.00',
      netDelta: '2500.00',
    });
    expect(useCasesMock.runForexRevaluation.execute).toHaveBeenCalled();
  });
});
