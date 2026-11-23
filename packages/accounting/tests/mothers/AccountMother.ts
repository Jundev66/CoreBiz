import { Account } from '../../src/domain/model/account';
import { AccountCode } from '../../src/domain/model/account-code';
import type { AccountCategory } from '../../src/domain/model/account-type';

export class AccountMother {
  static create(
    code = '1.1.01.01',
    name = 'Cash on Hand',
    category: AccountCategory = 'ASSET',
    tenantId = 'tenant-test-01',
    id = 'acc-test-01',
    isActive = true,
  ): Account {
    const codeResult = AccountCode.create(code);
    if (!codeResult.ok) {
      throw new Error(`Invalid AccountCode: ${code}`);
    }

    return new Account({
      id,
      tenantId,
      code: codeResult.value,
      name,
      category,
      isReconcilable: true,
      isActive,
    });
  }

  static asset(
    code = '1.1.02.01',
    name = 'Accounts Receivable',
    tenantId = 'tenant-test-01',
    id = 'acc-asset-01',
  ): Account {
    return AccountMother.create(code, name, 'ASSET', tenantId, id);
  }

  static liability(
    code = '2.1.02.01',
    name = 'VAT Payable',
    tenantId = 'tenant-test-01',
    id = 'acc-liab-01',
  ): Account {
    return AccountMother.create(code, name, 'LIABILITY', tenantId, id);
  }

  static revenue(
    code = '4.1.01.01',
    name = 'Sales Revenue',
    tenantId = 'tenant-test-01',
    id = 'acc-rev-01',
  ): Account {
    return AccountMother.create(code, name, 'REVENUE', tenantId, id);
  }

  static expense(
    code = '5.1.01.01',
    name = 'Office Supplies',
    tenantId = 'tenant-test-01',
    id = 'acc-exp-01',
  ): Account {
    return AccountMother.create(code, name, 'EXPENSE', tenantId, id);
  }
}
