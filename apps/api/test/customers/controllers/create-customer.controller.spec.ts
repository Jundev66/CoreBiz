import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateCustomerController } from '../../../src/modules/customers/controllers/create-customer.controller';
import { CreateCustomerDtoMother } from '../mothers/create-customer-dto.mother';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';

describe('CreateCustomerController', () => {
  let controller: CreateCustomerController;
  let useCasesMock: Partial<UseCases>;

  beforeEach(() => {
    useCasesMock = {
      createCustomer: vi.fn().mockResolvedValue(
        ok({
          id: '018e245a-0000-7000-8000-000000000002',
          code: 'CLI-0001',
        }),
      ),
    };

    controller = new CreateCustomerController(useCasesMock as UseCases);
  });

  it('delegates customer creation to use case', async () => {
    const dto = CreateCustomerDtoMother.create();

    const response = await controller.run(dto);

    expect(response).toEqual({
      id: '018e245a-0000-7000-8000-000000000002',
      code: 'CLI-0001',
    });
    expect(useCasesMock.createCustomer).toHaveBeenCalledWith({
      name: dto.name,
      taxId: dto.taxId,
      email: dto.email,
      phone: dto.phone,
      creditLimit: dto.creditLimit,
      addressLine1: dto.addressLine1,
      addressCity: dto.addressCity,
      addressState: dto.addressState,
    });
  });
});
