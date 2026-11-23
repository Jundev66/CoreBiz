import type { z } from 'zod';
import type { postJournalEntrySchema } from '@corebiz/contracts';

export type PostJournalEntryDto = z.infer<typeof postJournalEntrySchema>;

export class PostJournalEntryDtoMother {
  static create(overrides: Partial<PostJournalEntryDto> = {}): PostJournalEntryDto {
    return {
      date: new Date('2026-03-31T12:00:00.000Z'),
      description: 'Asiento contable de apertura',
      sourceType: 'MANUAL',
      lines: [
        {
          accountId: '018e245a-0000-7000-8000-000000000010',
          debitAmount: '100.00',
          creditAmount: '0',
          currency: 'USD',
          memo: 'Debito en Banco',
        },
        {
          accountId: '018e245a-0000-7000-8000-000000000020',
          debitAmount: '0',
          creditAmount: '100.00',
          currency: 'USD',
          memo: 'Credito en Capital',
        },
      ],
      ...overrides,
    };
  }
}
