import type { z } from 'zod';
import type { issueDeliveryNoteSchema } from '@corebiz/contracts';

export type IssueDeliveryNoteDto = z.infer<typeof issueDeliveryNoteSchema>;

export class IssueDeliveryNoteDtoMother {
  static create(overrides: Partial<IssueDeliveryNoteDto> = {}): IssueDeliveryNoteDto {
    return {
      customerId: '018e245a-0000-7000-8000-000000000002',
      lines: [
        {
          productId: '018e245a-0000-7000-8000-000000000010',
          quantity: '5',
          unitPrice: '15.00',
          discountBp: 0,
        },
      ],
      notes: 'Despacho para mostrador central',
      ...overrides,
    };
  }

  static withoutNotes(): IssueDeliveryNoteDto {
    return this.create({ notes: undefined });
  }

  static withMultipleLines(): IssueDeliveryNoteDto {
    return this.create({
      lines: [
        {
          productId: '018e245a-0000-7000-8000-000000000010',
          quantity: '2',
          unitPrice: '10.00',
        },
        {
          productId: '018e245a-0000-7000-8000-000000000011',
          quantity: '3',
          unitPrice: '20.00',
        },
      ],
    });
  }
}
