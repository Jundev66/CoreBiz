import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetUsTaxSummaryController } from '../../../src/modules/fiscal/controllers/get-us-tax-summary.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('GetUsTaxSummaryController', () => {
  let controller: GetUsTaxSummaryController;
  let executeSpy: ReturnType<typeof vi.fn>;
  let useCasesMock: {
    generateUsTaxSummary: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    executeSpy = vi.fn().mockResolvedValue(
      ok({
        jurisdictions: [
          {
            stateCode: 'FL',
            jurisdictionName: 'Miami-Dade County',
            grossSalesMinor: 10000n,
            exemptSalesMinor: 0n,
            taxableSalesMinor: 10000n,
            taxRatePercentage: 7,
            taxCollectedMinor: 700n,
            currency: 'USD',
          },
        ],
        totalGrossSalesMinor: 10000n,
        totalExemptSalesMinor: 0n,
        totalTaxableSalesMinor: 10000n,
        totalTaxCollectedMinor: 700n,
        currency: 'USD',
      }),
    );

    useCasesMock = {
      generateUsTaxSummary: {
        execute: executeSpy,
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new GetUsTaxSummaryController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('delegates to generateUsTaxSummary and returns formatted response', async () => {
    const response = await controller.run({});

    expect(response.jurisdictions).toHaveLength(1);
    expect(response.jurisdictions[0]?.stateCode).toBe('FL');
    expect(response.totalGrossSalesMinor).toBe('10000');
    expect(response.totalTaxCollectedMinor).toBe('700');
    expect(executeSpy).toHaveBeenCalled();
  });
});
