import { type Currency, ok, err, type Result } from '@corebiz/shared-kernel';
import { type JournalEntryLine } from './journal-entry-line';

export type JournalSourceType =
  | 'INVOICE'
  | 'PAYMENT'
  | 'MANUAL'
  | 'ADJUSTMENT'
  | 'EXTERNAL_API'
  | 'TREASURY_SWAP'
  | 'PARTNER_DRAWING';

export interface JournalEntryError {
  readonly kind:
    'InsufficientJournalLines' | 'JournalEntryCurrencyMismatch' | 'UnbalancedJournalEntry';
  readonly totalDebits?: bigint;
  readonly totalCredits?: bigint;
  readonly discrepancy?: bigint;
}

export interface CreateJournalEntryProps {
  readonly id: string;
  readonly tenantId: string;
  readonly entryNumber: bigint;
  readonly date: Date;
  readonly description: string;
  readonly sourceType: JournalSourceType;
  readonly sourceId?: string | undefined;
  readonly lines: readonly JournalEntryLine[];
}

export class JournalEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly entryNumber: bigint;
  readonly date: Date;
  readonly description: string;
  readonly sourceType: JournalSourceType;
  readonly sourceId?: string | undefined;
  readonly lines: readonly JournalEntryLine[];
  readonly currency: Currency;
  readonly totalDebit: bigint;
  readonly totalCredit: bigint;

  private constructor(
    props: CreateJournalEntryProps,
    currency: Currency,
    totalDebit: bigint,
    totalCredit: bigint,
  ) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.entryNumber = props.entryNumber;
    this.date = props.date;
    this.description = props.description;
    this.sourceType = props.sourceType;
    this.sourceId = props.sourceId;
    this.lines = props.lines;
    this.currency = currency;
    this.totalDebit = totalDebit;
    this.totalCredit = totalCredit;
  }

  static create(props: CreateJournalEntryProps): Result<JournalEntry, JournalEntryError> {
    if (props.lines.length < 2) {
      return err({ kind: 'InsufficientJournalLines' });
    }

    const firstLine = props.lines[0];
    if (!firstLine) {
      return err({ kind: 'InsufficientJournalLines' });
    }

    const firstCurrency = firstLine.currency;
    let sumDebits = 0n;
    let sumCredits = 0n;

    for (const line of props.lines) {
      if (line.currency !== firstCurrency) {
        return err({ kind: 'JournalEntryCurrencyMismatch' });
      }
      sumDebits += line.debit.minorUnits;
      sumCredits += line.credit.minorUnits;
    }

    if (sumDebits !== sumCredits) {
      return err({
        kind: 'UnbalancedJournalEntry',
        totalDebits: sumDebits,
        totalCredits: sumCredits,
        discrepancy: sumDebits > sumCredits ? sumDebits - sumCredits : sumCredits - sumDebits,
      });
    }

    return ok(new JournalEntry(props, firstCurrency, sumDebits, sumCredits));
  }
}
