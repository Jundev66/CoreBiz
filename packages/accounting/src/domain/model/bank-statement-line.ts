import { type Currency, type Money, ok, err, type Result } from '@corebiz/shared-kernel';

export type BankStatementLineType = 'DEBIT' | 'CREDIT';
export type BankStatementLineStatus = 'UNMATCHED' | 'MATCHED' | 'ADJUSTED';

export interface BankStatementLineError {
  readonly kind: 'InvalidLineAmount' | 'LineAlreadyMatched' | 'LineAlreadyAdjusted';
}

export interface CreateBankStatementLineProps {
  readonly id: string;
  readonly statementId: string;
  readonly lineType: BankStatementLineType;
  readonly amount: Money;
  readonly transactionDate: Date;
  readonly reference: string;
  readonly description: string;
  readonly status?: BankStatementLineStatus;
  readonly matchedJournalEntryId?: string | undefined;
  readonly matchedJournalEntryLineId?: string | undefined;
}

export class BankStatementLine {
  readonly id: string;
  readonly statementId: string;
  readonly lineType: BankStatementLineType;
  readonly amount: Money;
  readonly transactionDate: Date;
  readonly reference: string;
  readonly description: string;
  readonly status: BankStatementLineStatus;
  readonly matchedJournalEntryId?: string | undefined;
  readonly matchedJournalEntryLineId?: string | undefined;

  private constructor(props: CreateBankStatementLineProps) {
    this.id = props.id;
    this.statementId = props.statementId;
    this.lineType = props.lineType;
    this.amount = props.amount;
    this.transactionDate = props.transactionDate;
    this.reference = props.reference;
    this.description = props.description;
    this.status = props.status ?? 'UNMATCHED';
    this.matchedJournalEntryId = props.matchedJournalEntryId;
    this.matchedJournalEntryLineId = props.matchedJournalEntryLineId;
  }

  static create(
    props: CreateBankStatementLineProps,
  ): Result<BankStatementLine, BankStatementLineError> {
    if (props.amount.isNegative || props.amount.isZero) {
      return err({ kind: 'InvalidLineAmount' });
    }

    return ok(new BankStatementLine(props));
  }

  get currency(): Currency {
    return this.amount.currency;
  }

  get isMatched(): boolean {
    return this.status === 'MATCHED';
  }

  get isAdjusted(): boolean {
    return this.status === 'ADJUSTED';
  }

  get isPending(): boolean {
    return this.status === 'UNMATCHED';
  }

  match(
    journalEntryId: string,
    journalEntryLineId?: string,
  ): Result<BankStatementLine, BankStatementLineError> {
    if (this.status === 'MATCHED') {
      return err({ kind: 'LineAlreadyMatched' });
    }
    if (this.status === 'ADJUSTED') {
      return err({ kind: 'LineAlreadyAdjusted' });
    }

    return ok(
      new BankStatementLine({
        ...this,
        status: 'MATCHED',
        matchedJournalEntryId: journalEntryId,
        matchedJournalEntryLineId: journalEntryLineId,
      }),
    );
  }

  adjust(journalEntryId: string): Result<BankStatementLine, BankStatementLineError> {
    if (this.status === 'MATCHED') {
      return err({ kind: 'LineAlreadyMatched' });
    }
    if (this.status === 'ADJUSTED') {
      return err({ kind: 'LineAlreadyAdjusted' });
    }

    return ok(
      new BankStatementLine({
        ...this,
        status: 'ADJUSTED',
        matchedJournalEntryId: journalEntryId,
      }),
    );
  }
}
