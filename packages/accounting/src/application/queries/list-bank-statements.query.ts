import { type BankStatement, type BankStatementRepository } from '../../domain/index';

export interface ListBankStatementsQuery {
  readonly tenantId: string;
  readonly bankAccountId?: string | undefined;
}

export class ListBankStatementsQueryHandler {
  constructor(private readonly statementRepository: BankStatementRepository) {}

  async execute(query: ListBankStatementsQuery): Promise<readonly BankStatement[]> {
    return this.statementRepository.listByTenant(query.tenantId, query.bankAccountId);
  }
}
