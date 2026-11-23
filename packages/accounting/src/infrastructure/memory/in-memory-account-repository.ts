import { type Account, type AccountCode, type AccountRepository } from '../../domain/index';

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, Account>();

  findById(tenantId: string, id: string): Promise<Account | null> {
    const account = this.accounts.get(id);
    if (!account || account.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(account);
  }

  findByCode(tenantId: string, code: AccountCode): Promise<Account | null> {
    for (const account of this.accounts.values()) {
      if (account.tenantId === tenantId && account.code.value === code.value) {
        return Promise.resolve(account);
      }
    }
    return Promise.resolve(null);
  }

  listByTenant(tenantId: string): Promise<readonly Account[]> {
    const result: Account[] = [];
    for (const account of this.accounts.values()) {
      if (account.tenantId === tenantId) {
        result.push(account);
      }
    }
    result.sort((a, b) => a.code.value.localeCompare(b.code.value));
    return Promise.resolve(result);
  }

  save(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
    return Promise.resolve();
  }

  clear(): void {
    this.accounts.clear();
  }
}
