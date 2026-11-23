import { Money, ok, err, type Result } from '@corebiz/shared-kernel';
import type { InvoiceStatus } from './invoice-status';
import type { InvoiceType } from './invoice-type';
import type { InvoiceLine } from './invoice-line';
import type { FiscalControlData } from './fiscal-control-data';

export interface InvoiceError {
  readonly kind:
    | 'EmptyInvoiceLines'
    | 'InvoiceCurrencyMismatch'
    | 'PaymentExceedsRemainingBalance'
    | 'CannotPayNonIssuedInvoice'
    | 'CannotVoidPaidInvoice'
    | 'InvoiceAlreadyVoid';
  readonly currentStatus?: InvoiceStatus;
  readonly remainingBalance?: bigint;
  readonly attemptedPayment?: bigint;
}

export interface InvoiceProps {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly documentType: InvoiceType;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly fiscalControl?: FiscalControlData | undefined;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly lines: readonly InvoiceLine[];
  readonly status?: InvoiceStatus;
  readonly paidAmount?: Money;
  readonly igtfTotal?: Money;
}

export class Invoice {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly documentType: InvoiceType;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly fiscalControl?: FiscalControlData | undefined;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly lines: readonly InvoiceLine[];
  readonly status: InvoiceStatus;
  readonly subtotal: Money;
  readonly taxTotal: Money;
  readonly igtfTotal: Money;
  readonly total: Money;
  readonly paidAmount: Money;
  readonly remainingBalance: Money;

  private constructor(
    props: InvoiceProps,
    subtotal: Money,
    taxTotal: Money,
    igtfTotal: Money,
    total: Money,
    paidAmount: Money,
    remainingBalance: Money,
    status: InvoiceStatus,
  ) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.customerId = props.customerId;
    this.documentType = props.documentType;
    this.documentNumber = props.documentNumber;
    this.controlNumber = props.controlNumber;
    this.fiscalControl = props.fiscalControl;
    this.issueDate = props.issueDate;
    this.dueDate = props.dueDate;
    this.lines = props.lines;
    this.status = status;
    this.subtotal = subtotal;
    this.taxTotal = taxTotal;
    this.igtfTotal = igtfTotal;
    this.total = total;
    this.paidAmount = paidAmount;
    this.remainingBalance = remainingBalance;
  }

  static create(props: InvoiceProps): Result<Invoice, InvoiceError> {
    if (props.lines.length === 0) {
      return err({ kind: 'EmptyInvoiceLines' });
    }

    const firstLine = props.lines[0];
    if (!firstLine) {
      return err({ kind: 'EmptyInvoiceLines' });
    }

    const currency = firstLine.subtotal.currency;
    let subtotalMinor = 0n;
    let taxMinor = 0n;

    for (const line of props.lines) {
      if (line.subtotal.currency !== currency) {
        return err({ kind: 'InvoiceCurrencyMismatch' });
      }
      subtotalMinor += line.subtotal.minorUnits;
      taxMinor += line.taxAmount.minorUnits;
    }

    const subtotal = Money.fromMinor(subtotalMinor, currency);
    const taxTotal = Money.fromMinor(taxMinor, currency);
    const igtfTotal = props.igtfTotal ?? Money.zero(currency);
    const totalMinor = subtotalMinor + taxMinor + igtfTotal.minorUnits;
    const total = Money.fromMinor(totalMinor, currency);

    const paidAmount = props.paidAmount ?? Money.zero(currency);
    const remainingMinor = totalMinor - paidAmount.minorUnits;
    const remainingBalance = Money.fromMinor(remainingMinor, currency);

    const status = props.status ?? 'ISSUED';

    return ok(
      new Invoice(
        props,
        subtotal,
        taxTotal,
        igtfTotal,
        total,
        paidAmount,
        remainingBalance,
        status,
      ),
    );
  }

  applyPayment(payment: Money): Result<Invoice, InvoiceError> {
    if (this.status !== 'ISSUED' && this.status !== 'PARTIALLY_PAID') {
      return err({ kind: 'CannotPayNonIssuedInvoice', currentStatus: this.status });
    }

    if (payment.currency !== this.total.currency) {
      return err({ kind: 'InvoiceCurrencyMismatch' });
    }

    if (payment.minorUnits > this.remainingBalance.minorUnits) {
      return err({
        kind: 'PaymentExceedsRemainingBalance',
        remainingBalance: this.remainingBalance.minorUnits,
        attemptedPayment: payment.minorUnits,
      });
    }

    const newPaidAmount = Money.fromMinor(
      this.paidAmount.minorUnits + payment.minorUnits,
      this.total.currency,
    );
    const newRemainingBalance = Money.fromMinor(
      this.total.minorUnits - newPaidAmount.minorUnits,
      this.total.currency,
    );
    const newStatus: InvoiceStatus = newRemainingBalance.isZero ? 'PAID' : 'PARTIALLY_PAID';

    return ok(
      new Invoice(
        this,
        this.subtotal,
        this.taxTotal,
        this.igtfTotal,
        this.total,
        newPaidAmount,
        newRemainingBalance,
        newStatus,
      ),
    );
  }

  void(): Result<Invoice, InvoiceError> {
    if (this.status === 'VOID') {
      return err({ kind: 'InvoiceAlreadyVoid' });
    }

    if (this.paidAmount.isPositive) {
      return err({ kind: 'CannotVoidPaidInvoice' });
    }

    return ok(
      new Invoice(
        this,
        this.subtotal,
        this.taxTotal,
        this.igtfTotal,
        this.total,
        this.paidAmount,
        Money.zero(this.total.currency),
        'VOID',
      ),
    );
  }
}
