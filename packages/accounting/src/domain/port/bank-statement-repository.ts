import { type BankStatement } from '../model/bank-statement';

export interface BankStatementRepository {
  findById(tenantId: string, id: string): Promise<BankStatement | null>;
  listByTenant(tenantId: string, bankAccountId?: string): Promise<readonly BankStatement[]>;
  save(statement: BankStatement): Promise<void>;
}
