import { ok, type Result } from '@corebiz/shared-kernel';
import type { AccountRepository } from '../../domain/port/accounting-repository';
import { ChartOfAccountsRegistry } from '../../domain/templates/default-chart-of-accounts';

export interface ListAccountsQuery {
  readonly tenantId: string;
  readonly fiscalCountry?: string | undefined;
}

export interface AccountViewItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly normalSide: 'DEBIT' | 'CREDIT';
  readonly isReconcilable: boolean;
  readonly isActive: boolean;
}

export class ListAccountsQueryHandler {
  constructor(private readonly accountRepository: AccountRepository) {}

  async execute(query: ListAccountsQuery): Promise<Result<readonly AccountViewItem[], never>> {
    const existing = await this.accountRepository.listByTenant(query.tenantId);

    if (existing.length > 0) {
      return ok(
        existing.map((acc) => ({
          id: acc.id,
          code: acc.code.value,
          name: acc.name,
          category: acc.category,
          normalSide: acc.normalSide,
          isReconcilable: acc.isReconcilable,
          isActive: acc.isActive,
        })),
      );
    }

    if (query.fiscalCountry && ChartOfAccountsRegistry.has(query.fiscalCountry)) {
      const templates = ChartOfAccountsRegistry.get(query.fiscalCountry);
      const items: AccountViewItem[] = templates.map((tmpl) => ({
        id: `tpl-${tmpl.code}`,
        code: tmpl.code,
        name: tmpl.name,
        category: tmpl.category,
        normalSide:
          tmpl.category === 'ASSET' || tmpl.category === 'EXPENSE' || tmpl.category === 'COGS'
            ? 'DEBIT'
            : 'CREDIT',
        isReconcilable: tmpl.isReconcilable,
        isActive: true,
      }));
      return ok(items);
    }

    return ok([]);
  }
}
