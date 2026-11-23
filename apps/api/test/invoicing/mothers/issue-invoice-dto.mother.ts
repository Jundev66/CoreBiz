import type { z } from 'zod';
import type { issueInvoiceSchema } from '@corebiz/contracts';

export type IssueInvoiceDto = z.infer<typeof issueInvoiceSchema>;

export class IssueInvoiceDtoMother {
  static create(overrides: Partial<IssueInvoiceDto> = {}): IssueInvoiceDto {
    return {
      customerId: '018e245a-0000-7000-8000-000000000002',
      documentType: 'STANDARD',
      documentNumber: 'FAC-000001',
      controlNumber: '00-000001',
      issueDate: new Date('2026-03-31T10:00:00.000Z'),
      dueDate: new Date('2026-04-15T10:00:00.000Z'),
      currency: 'USD',
      receivableAccountId: '018e245a-0000-7000-8000-000000000010',
      revenueAccountId: '018e245a-0000-7000-8000-000000000020',
      taxPayableAccountId: '018e245a-0000-7000-8000-000000000030',
      lines: [
        {
          description: 'Consultoria Contable Especializada',
          quantity: '1',
          unitPrice: '100.00',
          taxPercentage: 16,
        },
      ],
      ...overrides,
    };
  }
}
