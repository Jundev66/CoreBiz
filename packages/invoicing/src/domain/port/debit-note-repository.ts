import type { DebitNote } from '../model/debit-note';

export interface DebitNoteFilter {
  readonly customerId?: string | undefined;
  readonly affectedInvoiceId?: string | undefined;
}

export interface DebitNoteRepository {
  findById(tenantId: string, id: string): Promise<DebitNote | null>;
  findByNumber(tenantId: string, debitNoteNumber: string): Promise<DebitNote | null>;
  listByInvoice(tenantId: string, affectedInvoiceId: string): Promise<readonly DebitNote[]>;
  listByTenant(tenantId: string, filter?: DebitNoteFilter): Promise<readonly DebitNote[]>;
  nextDebitNoteNumber(tenantId: string): Promise<string>;
  save(debitNote: DebitNote): Promise<void>;
}
