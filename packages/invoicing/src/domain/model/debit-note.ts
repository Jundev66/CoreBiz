import { Money, ok, err, type Result } from '@corebiz/shared-kernel';
import type { InvoiceLine } from './invoice-line';

export type DebitNoteReason = 'INTEREST' | 'PRICE_CORRECTION' | 'ADDITIONAL_CHARGE' | 'OTHER';

export interface DebitNoteError {
  readonly kind:
    | 'EmptyDebitNoteLines'
    | 'DebitNoteCurrencyMismatch'
    | 'InvalidDebitNoteNumber'
    | 'MissingAffectedInvoice';
  readonly details?: string | undefined;
}

export interface DebitNoteProps {
  readonly id: string;
  readonly tenantId: string;
  readonly debitNoteNumber: string;
  readonly controlNumber?: string | undefined;
  readonly affectedInvoiceId: string;
  readonly affectedDocumentNumber: string;
  readonly customerId: string;
  readonly reason: DebitNoteReason;
  readonly reasonDetails?: string | undefined;
  readonly issueDate: Date;
  readonly lines: readonly InvoiceLine[];
}

export class DebitNote {
  readonly id: string;
  readonly tenantId: string;
  readonly debitNoteNumber: string;
  readonly controlNumber?: string | undefined;
  readonly affectedInvoiceId: string;
  readonly affectedDocumentNumber: string;
  readonly customerId: string;
  readonly reason: DebitNoteReason;
  readonly reasonDetails?: string | undefined;
  readonly issueDate: Date;
  readonly lines: readonly InvoiceLine[];
  readonly subtotal: Money;
  readonly taxTotal: Money;
  readonly total: Money;

  private constructor(props: DebitNoteProps, subtotal: Money, taxTotal: Money, total: Money) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.debitNoteNumber = props.debitNoteNumber;
    this.controlNumber = props.controlNumber;
    this.affectedInvoiceId = props.affectedInvoiceId;
    this.affectedDocumentNumber = props.affectedDocumentNumber;
    this.customerId = props.customerId;
    this.reason = props.reason;
    this.reasonDetails = props.reasonDetails;
    this.issueDate = props.issueDate;
    this.lines = props.lines;
    this.subtotal = subtotal;
    this.taxTotal = taxTotal;
    this.total = total;
  }

  static create(props: DebitNoteProps): Result<DebitNote, DebitNoteError> {
    if (!props.debitNoteNumber || props.debitNoteNumber.trim().length === 0) {
      return err({ kind: 'InvalidDebitNoteNumber', details: 'Debit note number cannot be empty' });
    }

    if (!props.affectedInvoiceId || props.affectedInvoiceId.trim().length === 0) {
      return err({ kind: 'MissingAffectedInvoice', details: 'Affected invoice ID is required' });
    }

    if (props.lines.length === 0) {
      return err({ kind: 'EmptyDebitNoteLines' });
    }

    const firstLine = props.lines[0];
    if (!firstLine) {
      return err({ kind: 'EmptyDebitNoteLines' });
    }

    const currency = firstLine.subtotal.currency;
    let subtotalMinor = 0n;
    let taxMinor = 0n;

    for (const line of props.lines) {
      if (line.subtotal.currency !== currency) {
        return err({ kind: 'DebitNoteCurrencyMismatch' });
      }
      subtotalMinor += line.subtotal.minorUnits;
      taxMinor += line.taxAmount.minorUnits;
    }

    const subtotal = Money.fromMinor(subtotalMinor, currency);
    const taxTotal = Money.fromMinor(taxMinor, currency);
    const total = Money.fromMinor(subtotalMinor + taxMinor, currency);

    return ok(new DebitNote(props, subtotal, taxTotal, total));
  }
}
