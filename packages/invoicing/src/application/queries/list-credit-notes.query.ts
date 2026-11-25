import type { CreditNote, CreditNoteFilter, CreditNoteRepository } from '../../domain';

export interface ListCreditNotesQuery {
  readonly tenantId: string;
  readonly filter?: CreditNoteFilter | undefined;
}

export class ListCreditNotesQueryHandler {
  constructor(private readonly creditNoteRepo: CreditNoteRepository) {}

  async execute(query: ListCreditNotesQuery): Promise<readonly CreditNote[]> {
    return this.creditNoteRepo.listByTenant(query.tenantId, query.filter);
  }
}
