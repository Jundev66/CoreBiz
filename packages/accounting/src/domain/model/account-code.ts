import { ok, err, type Result } from '@corebiz/shared-kernel';

export interface AccountCodeError {
  readonly kind: 'InvalidAccountCodeFormat';
  readonly raw: string;
}

const ACCOUNT_CODE_REGEX = /^\d+(\.\d+)*$/;

export class AccountCode {
  private constructor(
    readonly value: string,
    readonly segments: readonly string[],
  ) {}

  static create(raw: string): Result<AccountCode, AccountCodeError> {
    const trimmed = raw.trim();
    if (!ACCOUNT_CODE_REGEX.test(trimmed)) {
      return err({ kind: 'InvalidAccountCodeFormat', raw });
    }

    const segments = trimmed.split('.');
    return ok(new AccountCode(trimmed, segments));
  }

  level(): number {
    return this.segments.length;
  }

  parentCode(): string | null {
    if (this.segments.length <= 1) {
      return null;
    }
    return this.segments.slice(0, -1).join('.');
  }
}
