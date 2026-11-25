import { Money, ok, err, type Result } from '@corebiz/shared-kernel';
import type { InvoiceLine } from './invoice-line';

export type CreditNoteReason =
  'RETURN' | 'PRICE_CORRECTION' | 'DISCOUNT' | 'CANCELLATION' | 'OTHER';

export interface CreditNoteError {
  readonly kind:
    | 'EmptyCreditNoteLines'
    | 'CreditNoteCurrencyMismatch'
    | 'InvalidCreditNoteNumber'
    | 'MissingAffectedInvoice';
  readonly details?: string | undefined;
}

export interface CreditNoteProps {
  readonly id: string;
  readonly tenantId: string;
  readonly creditNoteNumber: string;
  readonly controlNumber?: string | undefined;
  readonly affectedInvoiceId: string;
  readonly affectedDocumentNumber: string;
  readonly customerId: string;
  readonly reason: CreditNoteReason;
  readonly reasonDetails?: string | undefined;
  readonly issueDate: Date;
  readonly restockItems?: boolean | undefined;
  readonly warehouseId?: string | undefined;
  readonly lines: readonly InvoiceLine[];
}

export class CreditNote {
  readonly id: string;
  readonly tenantId: string;
  readonly creditNoteNumber: string;
  readonly controlNumber?: string | undefined;
  readonly affectedInvoiceId: string;
  readonly affectedDocumentNumber: string;
  readonly customerId: string;
  readonly reason: CreditNoteReason;
  readonly reasonDetails?: string | undefined;
  readonly issueDate: Date;
  readonly restockItems: boolean;
  readonly warehouseId?: string | undefined;
  readonly lines: readonly InvoiceLine[];
  readonly subtotal: Money;
  readonly taxTotal: Money;
  readonly total: Money;

  private constructor(props: CreditNoteProps, subtotal: Money, taxTotal: Money, total: Money) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.creditNoteNumber = props.creditNoteNumber;
    this.controlNumber = props.controlNumber;
    this.affectedInvoiceId = props.affectedInvoiceId;
    this.affectedDocumentNumber = props.affectedDocumentNumber;
    this.customerId = props.customerId;
    this.reason = props.reason;
    this.reasonDetails = props.reasonDetails;
    this.issueDate = props.issueDate;
    this.restockItems = props.restockItems ?? false;
    this.warehouseId = props.warehouseId;
    this.lines = props.lines;
    this.subtotal = subtotal;
    this.taxTotal = taxTotal;
    this.total = total;
  }

  static create(props: CreditNoteProps): Result<CreditNote, CreditNoteError> {
    if (!props.creditNoteNumber || props.creditNoteNumber.trim().length === 0) {
      return err({
        kind: 'InvalidCreditNoteNumber',
        details: 'Credit note number cannot be empty',
      });
    }

    if (!props.affectedInvoiceId || props.affectedInvoiceId.trim().length === 0) {
      return err({ kind: 'MissingAffectedInvoice', details: 'Affected invoice ID is required' });
    }

    if (props.lines.length === 0) {
      return err({ kind: 'EmptyCreditNoteLines' });
    }

    const firstLine = props.lines[0];
    if (!firstLine) {
      return err({ kind: 'EmptyCreditNoteLines' });
    }

    const currency = firstLine.subtotal.currency;
    let subtotalMinor = 0n;
    let taxMinor = 0n;

    for (const line of props.lines) {
      if (line.subtotal.currency !== currency) {
        return err({ kind: 'CreditNoteCurrencyMismatch' });
      }
      subtotalMinor += line.subtotal.minorUnits;
      taxMinor += line.taxAmount.minorUnits;
    }

    const subtotal = Money.fromMinor(subtotalMinor, currency);
    const taxTotal = Money.fromMinor(taxMinor, currency);
    const total = Money.fromMinor(subtotalMinor + taxMinor, currency);

    return ok(new CreditNote(props, subtotal, taxTotal, total));
  }
}
