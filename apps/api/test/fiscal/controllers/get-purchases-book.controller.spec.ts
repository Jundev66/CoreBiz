import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPurchasesBookController } from '../../../src/modules/fiscal/controllers/get-purchases-book.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('GetPurchasesBookController', () => {
  let controller: GetPurchasesBookController;
  let executeSpy: ReturnType<typeof vi.fn>;
  let useCasesMock: {
    generatePurchasesBook: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    executeSpy = vi.fn().mockResolvedValue(
      ok({
        records: [],
        totalPurchasesMinor: 0n,
        totalExemptMinor: 0n,
        totalTaxableBaseMinor: 0n,
        totalTaxCreditMinor: 0n,
        totalWithheldMinor: 0n,
        currency: 'VES',
      }),
    );

    useCasesMock = {
      generatePurchasesBook: {
        execute: executeSpy,
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new GetPurchasesBookController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('delegates to generatePurchasesBook and returns formatted response', async () => {
    const response = await controller.run({});

    expect(response.records).toEqual([]);
    expect(response.totalPurchasesMinor).toBe('0');
    expect(executeSpy).toHaveBeenCalled();
  });
});
