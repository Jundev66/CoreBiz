import { ok, type Result } from '@corebiz/shared-kernel';
import type { Account } from '../../domain/model/account';
import type { AccountRepository } from '../../domain/port/accounting-repository';
import {
  ChartOfAccountsRegistry,
  createDefaultAccountsForJurisdiction,
} from '../../domain/templates/default-chart-of-accounts';

export interface ListAccountsQuery {
  readonly tenantId: string;
  readonly fiscalCountry?: string | undefined;
}

export interface AccountViewItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly parentId: string | null;
  readonly normalSide: 'DEBIT' | 'CREDIT';
  readonly isReconcilable: boolean;
  readonly isActive: boolean;
}

export class ListAccountsQueryHandler {
  constructor(private readonly accountRepository: AccountRepository) {}

  async execute(query: ListAccountsQuery): Promise<Result<readonly AccountViewItem[], never>> {
    let existing: readonly Account[];
    try {
      existing = await this.accountRepository.listByTenant(query.tenantId);
    } catch {
      existing = [];
    }

    if (existing.length > 0) {
      return ok(
        existing.map((acc) => ({
          id: acc.id,
          code: acc.code.value,
          name: acc.name,
          category: acc.category,
          parentId: acc.parentId ?? null,
          normalSide: acc.normalSide,
          isReconcilable: acc.isReconcilable,
          isActive: acc.isActive,
        })),
      );
    }

    if (query.fiscalCountry && ChartOfAccountsRegistry.has(query.fiscalCountry)) {
      const jurisdiction = query.fiscalCountry === 'US' ? 'US' : 'VE';
      const seeded = createDefaultAccountsForJurisdiction(query.tenantId, jurisdiction);
      for (const acc of seeded) {
        await this.accountRepository.save(acc).catch(() => {});
      }
      return ok(
        seeded.map((acc) => ({
          id: acc.id,
          code: acc.code.value,
          name: acc.name,
          category: acc.category,
          parentId: acc.parentId ?? null,
          normalSide: acc.normalSide,
          isReconcilable: acc.isReconcilable,
          isActive: acc.isActive,
        })),
      );
    }

    return ok([]);
  }
}
