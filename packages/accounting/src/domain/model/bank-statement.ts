import { type Currency, Money, ok, err, type Result } from '@corebiz/shared-kernel';
import type { BankStatementLine } from './bank-statement-line';

export type BankStatementStatus = 'OPEN' | 'RECONCILED';

export interface BankStatementError {
  readonly kind:
    | 'InvalidDateRange'
    | 'CurrencyMismatch'
    | 'LineNotFound'
    | 'StatementAlreadyReconciled'
    | 'UnreconciledVariance'
    | 'UnmatchedLinesExist';
  readonly expectedBalance?: bigint;
  readonly actualBalance?: bigint;
  readonly variance?: bigint;
}

export interface CreateBankStatementProps {
  readonly id: string;
  readonly tenantId: string;
  readonly bankAccountId: string;
  readonly currency: Currency;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly startingBalance: Money;
  readonly endingBalance: Money;
  readonly lines?: readonly BankStatementLine[];
  readonly status?: BankStatementStatus;
  readonly reconciledAt?: Date | undefined;
}

export class BankStatement {
  readonly id: string;
  readonly tenantId: string;
  readonly bankAccountId: string;
  readonly currency: Currency;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly startingBalance: Money;
  readonly endingBalance: Money;
  readonly lines: readonly BankStatementLine[];
  readonly status: BankStatementStatus;
  readonly reconciledAt?: Date | undefined;

  private constructor(props: CreateBankStatementProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.bankAccountId = props.bankAccountId;
    this.currency = props.currency;
    this.startDate = props.startDate;
    this.endDate = props.endDate;
    this.startingBalance = props.startingBalance;
    this.endingBalance = props.endingBalance;
    this.lines = props.lines ?? [];
    this.status = props.status ?? 'OPEN';
    this.reconciledAt = props.reconciledAt;
  }

  static create(props: CreateBankStatementProps): Result<BankStatement, BankStatementError> {
    if (props.startDate > props.endDate) {
      return err({ kind: 'InvalidDateRange' });
    }

    if (
      props.startingBalance.currency !== props.currency ||
      props.endingBalance.currency !== props.currency
    ) {
      return err({ kind: 'CurrencyMismatch' });
    }

    for (const line of props.lines ?? []) {
      if (line.currency !== props.currency) {
        return err({ kind: 'CurrencyMismatch' });
      }
    }

    return ok(new BankStatement(props));
  }

  addLine(line: BankStatementLine): Result<BankStatement, BankStatementError> {
    if (this.status === 'RECONCILED') {
      return err({ kind: 'StatementAlreadyReconciled' });
    }
    if (line.currency !== this.currency) {
      return err({ kind: 'CurrencyMismatch' });
    }

    const updatedLines = [...this.lines, line];
    return ok(
      new BankStatement({
        ...this,
        lines: updatedLines,
      }),
    );
  }

  matchLine(
    lineId: string,
    journalEntryId: string,
    journalEntryLineId?: string,
  ): Result<BankStatement, BankStatementError> {
    if (this.status === 'RECONCILED') {
      return err({ kind: 'StatementAlreadyReconciled' });
    }

    const lineIndex = this.lines.findIndex((l) => l.id === lineId);
    if (lineIndex === -1) {
      return err({ kind: 'LineNotFound' });
    }

    const targetLine = this.lines[lineIndex]!;
    const matchResult = targetLine.match(journalEntryId, journalEntryLineId);
    if (!matchResult.ok) {
      return err({ kind: 'LineNotFound' });
    }

    const updatedLines = [...this.lines];
    updatedLines[lineIndex] = matchResult.value;

    return ok(
      new BankStatement({
        ...this,
        lines: updatedLines,
      }),
    );
  }

  adjustLine(lineId: string, journalEntryId: string): Result<BankStatement, BankStatementError> {
    if (this.status === 'RECONCILED') {
      return err({ kind: 'StatementAlreadyReconciled' });
    }

    const lineIndex = this.lines.findIndex((l) => l.id === lineId);
    if (lineIndex === -1) {
      return err({ kind: 'LineNotFound' });
    }

    const targetLine = this.lines[lineIndex]!;
    const adjustResult = targetLine.adjust(journalEntryId);
    if (!adjustResult.ok) {
      return err({ kind: 'LineNotFound' });
    }

    const updatedLines = [...this.lines];
    updatedLines[lineIndex] = adjustResult.value;

    return ok(
      new BankStatement({
        ...this,
        lines: updatedLines,
      }),
    );
  }

  calculateTotalCredits(): Money {
    let sum = 0n;
    for (const line of this.lines) {
      if (line.lineType === 'CREDIT') {
        sum += line.amount.minorUnits;
      }
    }
    return Money.fromMinor(sum, this.currency);
  }

  calculateTotalDebits(): Money {
    let sum = 0n;
    for (const line of this.lines) {
      if (line.lineType === 'DEBIT') {
        sum += line.amount.minorUnits;
      }
    }
    return Money.fromMinor(sum, this.currency);
  }

  calculateNetMovement(): Money {
    const credits = this.calculateTotalCredits().minorUnits;
    const debits = this.calculateTotalDebits().minorUnits;
    return Money.fromMinor(credits - debits, this.currency);
  }

  calculateCalculatedEndingBalance(): Money {
    const calculated =
      this.startingBalance.minorUnits +
      this.calculateTotalCredits().minorUnits -
      this.calculateTotalDebits().minorUnits;
    return Money.fromMinor(calculated, this.currency);
  }

  calculateReconciledBalance(): Money {
    let sumCredits = 0n;
    let sumDebits = 0n;

    for (const line of this.lines) {
      if (line.status === 'MATCHED' || line.status === 'ADJUSTED') {
        if (line.lineType === 'CREDIT') {
          sumCredits += line.amount.minorUnits;
        } else {
          sumDebits += line.amount.minorUnits;
        }
      }
    }

    const reconciledMovement = sumCredits - sumDebits;
    return Money.fromMinor(this.startingBalance.minorUnits + reconciledMovement, this.currency);
  }

  calculateUnmatchedLines(): readonly BankStatementLine[] {
    return this.lines.filter((l) => l.status === 'UNMATCHED');
  }

  calculateMatchedLines(): readonly BankStatementLine[] {
    return this.lines.filter((l) => l.status === 'MATCHED' || l.status === 'ADJUSTED');
  }

  markReconciled(bookBalance: Money): Result<BankStatement, BankStatementError> {
    if (this.status === 'RECONCILED') {
      return err({ kind: 'StatementAlreadyReconciled' });
    }

    const unmatched = this.calculateUnmatchedLines();
    if (unmatched.length > 0) {
      return err({ kind: 'UnmatchedLinesExist' });
    }

    const reconciledBalance = this.calculateReconciledBalance();
    if (reconciledBalance.minorUnits !== this.endingBalance.minorUnits) {
      return err({
        kind: 'UnreconciledVariance',
        expectedBalance: this.endingBalance.minorUnits,
        actualBalance: reconciledBalance.minorUnits,
        variance: this.endingBalance.minorUnits - reconciledBalance.minorUnits,
      });
    }

    if (bookBalance.minorUnits !== this.endingBalance.minorUnits) {
      return err({
        kind: 'UnreconciledVariance',
        expectedBalance: this.endingBalance.minorUnits,
        actualBalance: bookBalance.minorUnits,
        variance: this.endingBalance.minorUnits - bookBalance.minorUnits,
      });
    }

    return ok(
      new BankStatement({
        ...this,
        status: 'RECONCILED',
        reconciledAt: new Date(),
      }),
    );
  }
}
