import type { Disbursement } from '../model/disbursement';

export interface DisbursementRepository {
  save(disbursement: Disbursement): Promise<void>;
  findById(tenantId: string, id: string): Promise<Disbursement | null>;
  listByTenant(tenantId: string): Promise<readonly Disbursement[]>;
  nextDisbursementNumber(tenantId: string): Promise<bigint>;
}
