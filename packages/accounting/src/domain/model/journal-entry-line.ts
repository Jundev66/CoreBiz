import { type Currency, type Money, ok, err, type Result } from '@corebiz/shared-kernel';

export interface JournalLineError {
  readonly kind:
    | 'InvalidJournalLineBothDebitAndCredit'
    | 'InvalidJournalLineNegativeAmount'
    | 'InvalidJournalLineZeroAmount'
    | 'JournalLineCurrencyMismatch';
}

export class JournalEntryLine {
  private constructor(
    readonly accountId: string,
    readonly debit: Money,
    readonly credit: Money,
    readonly memo?: string,
  ) {}

  static create(
    accountId: string,
    debit: Money,
    credit: Money,
    memo?: string,
  ): Result<JournalEntryLine, JournalLineError> {
    if (debit.currency !== credit.currency) {
      return err({ kind: 'JournalLineCurrencyMismatch' });
    }

    if (debit.isNegative || credit.isNegative) {
      return err({ kind: 'InvalidJournalLineNegativeAmount' });
    }

    if (debit.isPositive && credit.isPositive) {
      return err({ kind: 'InvalidJournalLineBothDebitAndCredit' });
    }

    if (debit.isZero && credit.isZero) {
      return err({ kind: 'InvalidJournalLineZeroAmount' });
    }

    return ok(new JournalEntryLine(accountId, debit, credit, memo));
  }

  get currency(): Currency {
    return this.debit.currency;
  }
}
