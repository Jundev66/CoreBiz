import type { z } from 'zod';
import type { receiveGoodsSchema } from '@corebiz/contracts';

type ReceiveGoodsDto = z.infer<typeof receiveGoodsSchema>;

export class ReceiveGoodsDtoMother {
  static create(overrides?: Partial<ReceiveGoodsDto>): ReceiveGoodsDto {
    return {
      supplierId: '018e245a-0000-7000-8000-000000000401',
      lines: [
        {
          productId: '018e245a-0000-7000-8000-000000000101',
          quantity: '10.000',
          unitCost: '25.00',
        },
      ],
      supplierReference: 'FAC-2026-9988',
      notes: 'Recepcion lote principal',
      ...overrides,
    };
  }
}
