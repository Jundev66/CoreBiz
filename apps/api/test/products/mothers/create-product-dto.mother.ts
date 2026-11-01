import type { z } from 'zod';
import type { createProductSchema } from '@corebiz/contracts';

export type CreateProductDto = z.infer<typeof createProductSchema>;

export class CreateProductDtoMother {
  static create(overrides: Partial<CreateProductDto> = {}): CreateProductDto {
    return {
      sku: 'PRD-TEST-001',
      name: 'Producto de Prueba',
      price: '19.99',
      unit: 'und',
      cost: '12.50',
      initialStock: '50',
      minStock: '10',
      taxable: true,
      trackStock: true,
      ...overrides,
    };
  }

  static withoutSku(): CreateProductDto {
    return this.create({ sku: undefined });
  }

  static serviceWithoutStock(): CreateProductDto {
    return this.create({
      sku: 'SRV-001',
      name: 'Servicio de Mantenimiento',
      price: '50.00',
      trackStock: false,
      initialStock: undefined,
      minStock: undefined,
    });
  }
}
