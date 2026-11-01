import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateSupplierController } from '../../../src/modules/purchasing/controllers/create-supplier.controller';
import { CreateSupplierDtoMother } from '../mothers/create-supplier-dto.mother';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';

describe('CreateSupplierController', () => {
  let controller: CreateSupplierController;
  let useCasesMock: Partial<UseCases>;

  beforeEach(() => {
    useCasesMock = {
      createSupplier: vi.fn().mockResolvedValue(
        ok({
          id: '018e245a-0000-7000-8000-000000000401',
          code: 'PRV-0001',
        }),
      ),
    };

    controller = new CreateSupplierController(useCasesMock as UseCases);
  });

  it('delegates supplier creation to use case and returns id and code', async () => {
    const dto = CreateSupplierDtoMother.create();

    const response = await controller.run(dto);

    expect(response).toEqual({
      id: '018e245a-0000-7000-8000-000000000401',
      code: 'PRV-0001',
    });
    expect(useCasesMock.createSupplier).toHaveBeenCalledWith({
      name: dto.name,
      taxId: dto.taxId,
      email: dto.email,
      phone: dto.phone,
      contactName: dto.contactName,
      notes: dto.notes,
    });
  });
});
