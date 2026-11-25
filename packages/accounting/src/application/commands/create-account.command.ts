import { err, ok, type Result } from '@corebiz/shared-kernel';
import { Account } from '../../domain/model/account';
import { AccountCode } from '../../domain/model/account-code';
import type { AccountCategory } from '../../domain/model/account-type';
import type { AccountRepository } from '../../domain/port/accounting-repository';
import { ChartOfAccountsRegistry } from '../../domain/templates/default-chart-of-accounts';

export interface CreateAccountCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly category: AccountCategory;
  readonly parentId?: string | undefined;
  readonly isReconcilable?: boolean | undefined;
  readonly fiscalCountry?: string | undefined;
}

export interface CreateAccountError {
  readonly kind:
    | 'InvalidAccountCode'
    | 'DuplicateAccountCode'
    | 'ParentAccountNotFound'
    | 'ParentCategoryMismatch';
  readonly details?: string | undefined;
}

export class CreateAccountCommandHandler {
  constructor(private readonly accountRepository: AccountRepository) {}

  async execute(
    command: CreateAccountCommand,
  ): Promise<Result<{ accountId: string; code: string }, CreateAccountError>> {
    const codeResult = AccountCode.create(command.code);
    if (!codeResult.ok) {
      return err({ kind: 'InvalidAccountCode', details: command.code });
    }

    const existingList = await this.accountRepository.listByTenant(command.tenantId);
    if (
      existingList.length === 0 &&
      command.fiscalCountry &&
      ChartOfAccountsRegistry.has(command.fiscalCountry)
    ) {
      const template = ChartOfAccountsRegistry.get(command.fiscalCountry);
      for (const item of template) {
        const tmplCode = AccountCode.create(item.code);
        if (!tmplCode.ok) continue;
        await this.accountRepository.save(
          new Account({
            id: `tpl-${item.code}`,
            tenantId: command.tenantId,
            code: tmplCode.value,
            name: item.name,
            category: item.category,
            isReconcilable: item.isReconcilable,
            isActive: true,
          }),
        );
      }
    }

    const duplicate = await this.accountRepository.findByCode(command.tenantId, codeResult.value);
    if (duplicate) {
      return err({ kind: 'DuplicateAccountCode', details: codeResult.value.value });
    }

    if (command.parentId) {
      const parent = await this.accountRepository.findById(command.tenantId, command.parentId);
      if (!parent) {
        return err({ kind: 'ParentAccountNotFound', details: command.parentId });
      }
      if (parent.category !== command.category) {
        return err({
          kind: 'ParentCategoryMismatch',
          details: `Parent belongs to ${parent.category}`,
        });
      }
    }

    const account = new Account({
      id: command.id,
      tenantId: command.tenantId,
      code: codeResult.value,
      name: command.name.trim(),
      category: command.category,
      parentId: command.parentId,
      isReconcilable: command.isReconcilable ?? false,
      isActive: true,
    });

    await this.accountRepository.save(account);

    return ok({
      accountId: account.id,
      code: account.code.value,
    });
  }
}
