import type { z } from 'zod';
import type { createSupplierSchema } from '@corebiz/contracts';

type CreateSupplierDto = z.infer<typeof createSupplierSchema>;

export class CreateSupplierDtoMother {
  static create(overrides?: Partial<CreateSupplierDto>): CreateSupplierDto {
    return {
      name: 'Distribuidora Los Andes',
      taxId: 'J-98765432-1',
      email: 'ventas@losandes.com',
      phone: '+584149876543',
      contactName: 'Mariana Silva',
      notes: 'Despacho semanal los jueves',
      ...overrides,
    };
  }
}
