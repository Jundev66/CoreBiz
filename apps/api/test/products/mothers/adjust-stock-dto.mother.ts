import type { z } from 'zod';
import type { adjustStockSchema } from '@corebiz/contracts';

export type AdjustStockDto = z.infer<typeof adjustStockSchema>;

export class AdjustStockDtoMother {
  static create(overrides: Partial<AdjustStockDto> = {}): AdjustStockDto {
    return {
      newBalance: '150',
      reason: 'Conteo físico de inventario de fin de mes',
      ...overrides,
    };
  }

  static zeroStock(reason = 'Avería total de lote por humedad'): AdjustStockDto {
    return this.create({ newBalance: '0', reason });
  }
}
