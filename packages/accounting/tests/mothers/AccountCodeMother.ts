import { AccountCode } from '../../src/domain/model/account-code';

export class AccountCodeMother {
  static create(raw = '1.1.01.01'): AccountCode {
    const result = AccountCode.create(raw);
    if (!result.ok) {
      throw new Error(`Invalid AccountCode: ${raw}`);
    }
    return result.value;
  }

  static assetRoot(): AccountCode {
    return AccountCodeMother.create('1');
  }

  static currentAsset(): AccountCode {
    return AccountCodeMother.create('1.1');
  }

  static cashOnHand(): AccountCode {
    return AccountCodeMother.create('1.1.01.01');
  }

  static salesRevenue(): AccountCode {
    return AccountCodeMother.create('4.1.01.01');
  }
}
