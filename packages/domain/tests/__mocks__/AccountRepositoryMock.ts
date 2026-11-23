import { expect, vi } from 'vitest';
import type { AccountRepository } from '../../src/accounting/port/accounting-repository';
import type { Account } from '../../src/accounting/model/account';
import type { AccountCode } from '../../src/accounting/model/account-code';

export class AccountRepositoryMock implements AccountRepository {
  private readonly saveMock = vi.fn<(account: Account) => Promise<void>>();
  private readonly findByIdMock =
    vi.fn<(tenantId: string, id: string) => Promise<Account | null>>();
  private readonly findByCodeMock =
    vi.fn<(tenantId: string, code: AccountCode) => Promise<Account | null>>();
  private readonly listByTenantMock = vi.fn<(tenantId: string) => Promise<readonly Account[]>>();

  async save(account: Account): Promise<void> {
    await this.saveMock(account);
  }

  async findById(tenantId: string, id: string): Promise<Account | null> {
    return this.findByIdMock(tenantId, id);
  }

  async findByCode(tenantId: string, code: AccountCode): Promise<Account | null> {
    return this.findByCodeMock(tenantId, code);
  }

  async listByTenant(tenantId: string): Promise<readonly Account[]> {
    return this.listByTenantMock(tenantId);
  }

  returnOnFindById(account: Account | null): void {
    this.findByIdMock.mockResolvedValue(account);
  }

  returnOnFindByCode(account: Account | null): void {
    this.findByCodeMock.mockResolvedValue(account);
  }

  assertSaveHasBeenCalledWith(expectedAccount: Account): void {
    expect(this.saveMock).toHaveBeenCalledWith(expectedAccount);
  }
}
