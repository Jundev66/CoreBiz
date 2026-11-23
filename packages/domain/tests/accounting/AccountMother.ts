import { Account } from '../../src/accounting/model/account';
import { AccountCode } from '../../src/accounting/model/account-code';
import type { AccountCategory } from '../../src/accounting/model/account-type';

export class AccountMother {
  static create(
    code = '1.1.01.01',
    name = 'Cash on Hand',
    category: AccountCategory = 'ASSET',
    tenantId = 'tenant-test-01',
    id = 'acc-test-01',
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
      isActive: true,
    });
  }

  static asset(code = '1.1.02.01', name = 'Accounts Receivable'): Account {
    return AccountMother.create(code, name, 'ASSET');
  }

  static liability(code = '2.1.02.01', name = 'VAT Payable'): Account {
    return AccountMother.create(code, name, 'LIABILITY');
  }

  static revenue(code = '4.1.01.01', name = 'Sales Revenue'): Account {
    return AccountMother.create(code, name, 'REVENUE');
  }
}
