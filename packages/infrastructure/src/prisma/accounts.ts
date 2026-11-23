import type { PrismaClient } from '@corebiz/prisma-client';
import {
  Account,
  AccountCode,
  type AccountCategory,
  type AccountRepository,
} from '@corebiz/domain';
import type { Tx } from './session';

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly client: PrismaClient | Tx) {}

  async findById(tenantId: string, id: string): Promise<Account | null> {
    const row = await this.client.accounts.findFirst({
      where: {
        tenant_id: tenantId,
        id,
      },
    });

    if (!row) {
      return null;
    }

    const codeResult = AccountCode.create(row.code);
    if (!codeResult.ok) {
      return null;
    }

    return new Account({
      id: row.id,
      tenantId: row.tenant_id,
      code: codeResult.value,
      name: row.name,
      category: row.category as AccountCategory,
      parentId: row.parent_id ?? undefined,
      isReconcilable: row.is_reconcilable,
      isActive: row.is_active,
    });
  }

  async findByCode(tenantId: string, code: AccountCode): Promise<Account | null> {
    const row = await this.client.accounts.findFirst({
      where: {
        tenant_id: tenantId,
        code: code.value,
      },
    });

    if (!row) {
      return null;
    }

    const codeResult = AccountCode.create(row.code);
    if (!codeResult.ok) {
      return null;
    }

    return new Account({
      id: row.id,
      tenantId: row.tenant_id,
      code: codeResult.value,
      name: row.name,
      category: row.category as AccountCategory,
      parentId: row.parent_id ?? undefined,
      isReconcilable: row.is_reconcilable,
      isActive: row.is_active,
    });
  }

  async listByTenant(tenantId: string): Promise<readonly Account[]> {
    const rows = await this.client.accounts.findMany({
      where: {
        tenant_id: tenantId,
      },
      orderBy: {
        code: 'asc',
      },
    });

    const accounts: Account[] = [];
    for (const row of rows) {
      const codeResult = AccountCode.create(row.code);
      if (codeResult.ok) {
        accounts.push(
          new Account({
            id: row.id,
            tenantId: row.tenant_id,
            code: codeResult.value,
            name: row.name,
            category: row.category as AccountCategory,
            parentId: row.parent_id ?? undefined,
            isReconcilable: row.is_reconcilable,
            isActive: row.is_active,
          }),
        );
      }
    }

    return accounts;
  }

  async save(account: Account): Promise<void> {
    await this.client.accounts.upsert({
      where: {
        tenant_id_code: {
          tenant_id: account.tenantId,
          code: account.code.value,
        },
      },
      create: {
        id: account.id,
        tenant_id: account.tenantId,
        code: account.code.value,
        name: account.name,
        category: account.category,
        normal_side: account.normalSide,
        parent_id: account.parentId ?? null,
        is_reconcilable: account.isReconcilable,
        is_active: account.isActive,
      },
      update: {
        name: account.name,
        category: account.category,
        normal_side: account.normalSide,
        parent_id: account.parentId ?? null,
        is_reconcilable: account.isReconcilable,
        is_active: account.isActive,
      },
    });
  }
}
