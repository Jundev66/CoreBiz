import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceiveGoodsController } from '../../../src/modules/purchasing/controllers/receive-goods.controller';
import { ReceiveGoodsDtoMother } from '../mothers/receive-goods-dto.mother';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';

describe('ReceiveGoodsController', () => {
  let controller: ReceiveGoodsController;
  let useCasesMock: Partial<UseCases>;

  beforeEach(() => {
    useCasesMock = {
      receiveGoods: vi.fn().mockResolvedValue(
        ok({
          id: '018e245a-0000-7000-8000-000000000501',
          number: 'REC-2026-0001',
        }),
      ),
    };

    controller = new ReceiveGoodsController(useCasesMock as UseCases);
  });

  it('delegates goods receipt to use case', async () => {
    const dto = ReceiveGoodsDtoMother.create();

    const response = await controller.run(dto);

    expect(response).toEqual({
      id: '018e245a-0000-7000-8000-000000000501',
      number: 'REC-2026-0001',
    });
    expect(useCasesMock.receiveGoods).toHaveBeenCalledWith({
      supplierId: dto.supplierId,
      lines: dto.lines,
      supplierReference: dto.supplierReference,
      notes: dto.notes,
    });
  });
});
