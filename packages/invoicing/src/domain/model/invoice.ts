import { Money, ok, err, type Result } from '@corebiz/shared-kernel';
import type { InvoiceStatus } from './invoice-status';
import type { InvoiceType } from './invoice-type';
import type { InvoiceLine } from './invoice-line';
import type { FiscalControlData } from './fiscal-control-data';
import type { PaymentCondition } from './payment-condition';

export interface InvoiceError {
  readonly kind:
    | 'EmptyInvoiceLines'
    | 'InvoiceCurrencyMismatch'
    | 'PaymentExceedsRemainingBalance'
    | 'PaymentExceedsPaidAmount'
    | 'CannotPayNonIssuedInvoice'
    | 'CannotVoidPaidInvoice'
    | 'InvoiceAlreadyVoid'
    | 'CreditExceedsRemainingBalance'
    | 'CannotCreditVoidInvoice';
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
  readonly creditedAmount?: Money | undefined;
  readonly igtfTotal?: Money;
  readonly paymentCondition?: PaymentCondition | undefined;
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
  readonly creditedAmount: Money;
  readonly remainingBalance: Money;
  readonly paymentCondition: PaymentCondition;

  private constructor(
    props: InvoiceProps,
    subtotal: Money,
    taxTotal: Money,
    igtfTotal: Money,
    total: Money,
    paidAmount: Money,
    creditedAmount: Money,
    remainingBalance: Money,
    status: InvoiceStatus,
    paymentCondition: PaymentCondition,
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
    this.creditedAmount = creditedAmount;
    this.remainingBalance = remainingBalance;
    this.paymentCondition = paymentCondition;
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

    const paymentCondition = props.paymentCondition ?? 'CREDIT';
    const creditedAmount = props.creditedAmount ?? Money.zero(currency);

    let paidAmount: Money;
    let remainingBalance: Money;
    let status: InvoiceStatus;

    if (paymentCondition === 'CASH' && !props.status) {
      paidAmount = total;
      remainingBalance = Money.zero(currency);
      status = 'PAID';
    } else {
      paidAmount = props.paidAmount ?? Money.zero(currency);
      const remainingMinor = totalMinor - paidAmount.minorUnits - creditedAmount.minorUnits;
      const safeRemaining = remainingMinor > 0n ? remainingMinor : 0n;
      remainingBalance = Money.fromMinor(safeRemaining, currency);
      status = props.status ?? (safeRemaining === 0n && totalMinor > 0n ? 'PAID' : 'ISSUED');
    }

    return ok(
      new Invoice(
        props,
        subtotal,
        taxTotal,
        igtfTotal,
        total,
        paidAmount,
        creditedAmount,
        remainingBalance,
        status,
        paymentCondition,
      ),
    );
  }

  applyCredit(creditAmount: Money): Result<Invoice, InvoiceError> {
    if (this.status === 'VOID') {
      return err({ kind: 'CannotCreditVoidInvoice' });
    }

    if (creditAmount.currency !== this.total.currency) {
      return err({ kind: 'InvoiceCurrencyMismatch' });
    }

    if (creditAmount.minorUnits > this.remainingBalance.minorUnits) {
      return err({
        kind: 'CreditExceedsRemainingBalance',
        remainingBalance: this.remainingBalance.minorUnits,
        attemptedPayment: creditAmount.minorUnits,
      });
    }

    const newCreditedAmount = Money.fromMinor(
      this.creditedAmount.minorUnits + creditAmount.minorUnits,
      this.total.currency,
    );
    const newRemainingMinor =
      this.total.minorUnits - this.paidAmount.minorUnits - newCreditedAmount.minorUnits;
    const safeRemaining = newRemainingMinor > 0n ? newRemainingMinor : 0n;
    const newRemainingBalance = Money.fromMinor(safeRemaining, this.total.currency);
    const newStatus: InvoiceStatus = newRemainingBalance.isZero ? 'PAID' : 'PARTIALLY_PAID';

    return ok(
      new Invoice(
        this,
        this.subtotal,
        this.taxTotal,
        this.igtfTotal,
        this.total,
        this.paidAmount,
        newCreditedAmount,
        newRemainingBalance,
        newStatus,
        this.paymentCondition,
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
    const newRemainingMinor =
      this.total.minorUnits - newPaidAmount.minorUnits - this.creditedAmount.minorUnits;
    const safeRemaining = newRemainingMinor > 0n ? newRemainingMinor : 0n;
    const newRemainingBalance = Money.fromMinor(safeRemaining, this.total.currency);
    const newStatus: InvoiceStatus = newRemainingBalance.isZero ? 'PAID' : 'PARTIALLY_PAID';

    return ok(
      new Invoice(
        this,
        this.subtotal,
        this.taxTotal,
        this.igtfTotal,
        this.total,
        newPaidAmount,
        this.creditedAmount,
        newRemainingBalance,
        newStatus,
        this.paymentCondition,
      ),
    );
  }

  restorePayment(refundedAmount: Money): Result<Invoice, InvoiceError> {
    if (refundedAmount.currency !== this.total.currency) {
      return err({ kind: 'InvoiceCurrencyMismatch' });
    }

    if (refundedAmount.minorUnits > this.paidAmount.minorUnits) {
      return err({
        kind: 'PaymentExceedsPaidAmount',
        remainingBalance: this.paidAmount.minorUnits,
        attemptedPayment: refundedAmount.minorUnits,
      });
    }

    const newPaidMinor = this.paidAmount.minorUnits - refundedAmount.minorUnits;
    const newPaidAmount = Money.fromMinor(newPaidMinor, this.total.currency);
    const newRemainingMinor = this.total.minorUnits - newPaidMinor - this.creditedAmount.minorUnits;
    const safeRemaining = newRemainingMinor > 0n ? newRemainingMinor : 0n;
    const newRemainingBalance = Money.fromMinor(safeRemaining, this.total.currency);
    const newStatus: InvoiceStatus = newPaidMinor === 0n ? 'ISSUED' : 'PARTIALLY_PAID';

    return ok(
      new Invoice(
        this,
        this.subtotal,
        this.taxTotal,
        this.igtfTotal,
        this.total,
        newPaidAmount,
        this.creditedAmount,
        newRemainingBalance,
        newStatus,
        this.paymentCondition,
      ),
    );
  }

  void(): Result<Invoice, InvoiceError> {
    if (this.status === 'VOID') {
      return err({ kind: 'InvoiceAlreadyVoid' });
    }

    if (this.paidAmount.isPositive || this.creditedAmount.isPositive) {
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
        this.creditedAmount,
        Money.zero(this.total.currency),
        'VOID',
        this.paymentCondition,
      ),
    );
  }
}
