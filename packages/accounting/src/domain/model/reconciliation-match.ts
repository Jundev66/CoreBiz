import { type Money } from '@corebiz/shared-kernel';

export interface ReconciliationMatchProps {
  readonly statementId: string;
  readonly statementLineId: string;
  readonly journalEntryId: string;
  readonly journalEntryLineId?: string | undefined;
  readonly matchedAmount: Money;
  readonly difference: Money;
  readonly matchedAt: Date;
}

export class ReconciliationMatch {
  readonly statementId: string;
  readonly statementLineId: string;
  readonly journalEntryId: string;
  readonly journalEntryLineId?: string | undefined;
  readonly matchedAmount: Money;
  readonly difference: Money;
  readonly matchedAt: Date;

  constructor(props: ReconciliationMatchProps) {
    this.statementId = props.statementId;
    this.statementLineId = props.statementLineId;
    this.journalEntryId = props.journalEntryId;
    this.journalEntryLineId = props.journalEntryLineId;
    this.matchedAmount = props.matchedAmount;
    this.difference = props.difference;
    this.matchedAt = props.matchedAt;
  }
}
