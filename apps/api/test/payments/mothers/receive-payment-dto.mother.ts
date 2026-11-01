import type { z } from 'zod';
import type { receivePaymentSchema } from '@corebiz/contracts';

type ReceivePaymentDto = z.infer<typeof receivePaymentSchema>;

export class ReceivePaymentDtoMother {
  static create(overrides?: Partial<ReceivePaymentDto>): ReceivePaymentDto {
    return {
      customerId: '018e245a-0000-7000-8000-000000000002',
      amount: '50.00',
      paymentMethod: 'cash_usd',
      reference: 'REF-PAY-001',
      notes: 'Pago completo de nota',
      allocations: [
        {
          deliveryNoteId: '018e245a-0000-7000-8000-000000000050',
          amount: '50.00',
        },
      ],
      ...overrides,
    };
  }
}
