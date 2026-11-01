import { type z } from 'zod';
import { type createCustomerSchema } from '@corebiz/contracts';

type CreateCustomerDto = z.infer<typeof createCustomerSchema>;

export class CreateCustomerDtoMother {
  static create(overrides?: Partial<CreateCustomerDto>): CreateCustomerDto {
    return {
      name: 'Supermercado El Sol',
      taxId: 'J-31234567-8',
      email: 'compras@elsol.com',
      phone: '+584241234567',
      creditLimit: '1000.00',
      addressLine1: 'Av. Bolívar cruce con Calle 5',
      addressCity: 'Valencia',
      addressState: 'Carabobo',
      ...overrides,
    };
  }
}
