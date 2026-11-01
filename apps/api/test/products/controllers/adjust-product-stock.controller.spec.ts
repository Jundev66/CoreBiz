import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdjustProductStockController } from '../../../src/modules/products/controllers/adjust-product-stock.controller';
import { AdjustStockDtoMother } from '../mothers/adjust-stock-dto.mother';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';

describe('AdjustProductStockController', () => {
  let controller: AdjustProductStockController;
  let useCasesMock: Partial<UseCases>;

  beforeEach(() => {
    useCasesMock = {
      adjustStock: vi.fn().mockResolvedValue(ok(undefined)),
    };

    controller = new AdjustProductStockController(useCasesMock as UseCases);
  });

  it('delegates stock adjustment to use case with product id and reason', async () => {
    const productId = '018e245a-0000-7000-8000-000000000010';
    const dto = AdjustStockDtoMother.create();

    await controller.run(productId, dto);

    expect(useCasesMock.adjustStock).toHaveBeenCalledWith({
      productId,
      newBalance: dto.newBalance,
      reason: dto.reason,
    });
  });
});
