import type { FiscalSequenceRange, FiscalSequenceRangeRepository } from '../../domain/index';

export interface ListFiscalSequenceRangesQuery {
  readonly tenantId: string;
}

export class ListFiscalSequenceRangesQueryHandler {
  constructor(private readonly sequenceRepo: FiscalSequenceRangeRepository) {}

  async execute(query: ListFiscalSequenceRangesQuery): Promise<readonly FiscalSequenceRange[]> {
    return this.sequenceRepo.listByTenant(query.tenantId);
  }
}
