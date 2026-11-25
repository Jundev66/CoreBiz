import type { DebitNote, DebitNoteFilter, DebitNoteRepository } from '../../domain';

export interface ListDebitNotesQuery {
  readonly tenantId: string;
  readonly filter?: DebitNoteFilter | undefined;
}

export class ListDebitNotesQueryHandler {
  constructor(private readonly debitNoteRepo: DebitNoteRepository) {}

  async execute(query: ListDebitNotesQuery): Promise<readonly DebitNote[]> {
    return this.debitNoteRepo.listByTenant(query.tenantId, query.filter);
  }
}
