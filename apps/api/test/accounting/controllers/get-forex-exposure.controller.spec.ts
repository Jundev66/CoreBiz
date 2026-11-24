import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetForexExposureController } from '../../../src/modules/accounting/controllers/get-forex-exposure.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('GetForexExposureController', () => {
  let controller: GetForexExposureController;
  let useCasesMock: {
    getForexExposure: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      getForexExposure: {
        execute: vi.fn().mockResolvedValue(
          ok({
            functionalCurrency: 'VES',
            foreignCurrency: 'USD',
            totalForeignAmount: '1000.00',
            totalUnrealizedGain: '2500.00',
            totalUnrealizedLoss: '0.00',
            netUnrealized: '2500.00',
            positions: [],
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new GetForexExposureController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('queries exposure and returns calculated theoretical gains and losses', async () => {
    const response = await controller.run({
      functionalCurrency: 'VES',
      foreignCurrency: 'USD',
      currentRate: '36.00',
      closingRate: '38.50',
    });

    expect(response.totalForeignAmount).toBe('1000.00');
    expect(response.totalUnrealizedGain).toBe('2500.00');
    expect(response.netUnrealized).toBe('2500.00');
    expect(useCasesMock.getForexExposure.execute).toHaveBeenCalled();
  });
});
