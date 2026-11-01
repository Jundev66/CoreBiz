import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateProductController } from '../../../src/modules/products/controllers/create-product.controller';
import { CreateProductDtoMother } from '../mothers/create-product-dto.mother';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';

describe('CreateProductController', () => {
  let controller: CreateProductController;
  let useCasesMock: Partial<UseCases>;

  beforeEach(() => {
    useCasesMock = {
      createProduct: vi.fn().mockResolvedValue(
        ok({
          id: '018e245a-0000-7000-8000-000000000010',
          sku: 'PRD-TEST-001',
        }),
      ),
    };

    controller = new CreateProductController(useCasesMock as UseCases);
  });

  it('delegates product creation to use case and returns id and sku', async () => {
    const dto = CreateProductDtoMother.create();

    const response = await controller.run(dto);

    expect(response).toEqual({
      id: '018e245a-0000-7000-8000-000000000010',
      sku: 'PRD-TEST-001',
    });
    expect(useCasesMock.createProduct).toHaveBeenCalledWith({
      sku: dto.sku,
      name: dto.name,
      price: dto.price,
      unit: dto.unit,
      cost: dto.cost,
      initialStock: dto.initialStock,
      minStock: dto.minStock,
      taxable: dto.taxable,
      trackStock: dto.trackStock,
    });
  });

  it('handles creation without optional sku', async () => {
    const dto = CreateProductDtoMother.withoutSku();

    await controller.run(dto);

    expect(useCasesMock.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: null,
        name: dto.name,
      }),
    );
  });
});
