import { type BankStatement, type BankStatementRepository } from '../../domain/index';

export class InMemoryBankStatementRepository implements BankStatementRepository {
  private readonly statements = new Map<string, BankStatement>();

  findById(tenantId: string, id: string): Promise<BankStatement | null> {
    const statement = this.statements.get(id);
    if (!statement || statement.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(statement);
  }

  listByTenant(tenantId: string, bankAccountId?: string): Promise<readonly BankStatement[]> {
    const results: BankStatement[] = [];
    for (const statement of this.statements.values()) {
      if (statement.tenantId === tenantId) {
        if (!bankAccountId || statement.bankAccountId === bankAccountId) {
          results.push(statement);
        }
      }
    }
    results.sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
    return Promise.resolve(results);
  }

  save(statement: BankStatement): Promise<void> {
    this.statements.set(statement.id, statement);
    return Promise.resolve();
  }

  clear(): void {
    this.statements.clear();
  }
}
