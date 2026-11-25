import type { CreditNote } from '../model/credit-note';

export interface CreditNoteFilter {
  readonly customerId?: string | undefined;
  readonly affectedInvoiceId?: string | undefined;
}

export interface CreditNoteRepository {
  findById(tenantId: string, id: string): Promise<CreditNote | null>;
  findByNumber(tenantId: string, creditNoteNumber: string): Promise<CreditNote | null>;
  listByInvoice(tenantId: string, affectedInvoiceId: string): Promise<readonly CreditNote[]>;
  listByTenant(tenantId: string, filter?: CreditNoteFilter): Promise<readonly CreditNote[]>;
  nextCreditNoteNumber(tenantId: string): Promise<string>;
  save(creditNote: CreditNote): Promise<void>;
}
