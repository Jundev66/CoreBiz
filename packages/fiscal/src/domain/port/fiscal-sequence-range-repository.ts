import type { FiscalSequenceRange } from '../model/fiscal-sequence-range';

export interface FiscalSequenceRangeRepository {
  findById(tenantId: string, id: string): Promise<FiscalSequenceRange | null>;
  findActiveRange(
    tenantId: string,
    documentType: string,
    prefix?: string,
  ): Promise<FiscalSequenceRange | null>;
  listByTenant(tenantId: string): Promise<readonly FiscalSequenceRange[]>;
  save(range: FiscalSequenceRange): Promise<void>;
}
