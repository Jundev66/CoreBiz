import { type Money, ok, err, type Result } from '@corebiz/shared-kernel';
import type { InvoicePaymentMethod } from './invoice-payment-method';

export type ReceiptStatus = 'ACTIVE' | 'VOIDED';

export interface PaymentReceiptAllocation {
  readonly invoiceId: string;
  readonly amount: Money;
  readonly previousBalance: Money;
  readonly newBalance: Money;
}

export interface PaymentReceiptProps {
  readonly id: string;
  readonly tenantId: string;
  readonly receiptNumber: string;
  readonly customerId: string;
  readonly amount: Money;
  readonly paymentMethod: InvoicePaymentMethod;
  readonly bankAccountId: string;
  readonly receiptDate: Date;
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
  readonly status?: ReceiptStatus | undefined;
  readonly allocations: readonly PaymentReceiptAllocation[];
  readonly voidReason?: string | undefined;
  readonly voidedAt?: Date | undefined;
}

export interface PaymentReceiptError {
  readonly kind:
    | 'EmptyAllocations'
    | 'AllocationCurrencyMismatch'
    | 'AllocationSumMismatch'
    | 'NegativeOrZeroAllocation'
    | 'AllocationExceedsPreviousBalance'
    | 'ReceiptAlreadyVoided'
    | 'VoidReasonRequired';
  readonly expectedMinor?: bigint;
  readonly actualMinor?: bigint;
}

export class PaymentReceipt {
  readonly id: string;
  readonly tenantId: string;
  readonly receiptNumber: string;
  readonly customerId: string;
  readonly amount: Money;
  readonly paymentMethod: InvoicePaymentMethod;
  readonly bankAccountId: string;
  readonly receiptDate: Date;
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
  readonly status: ReceiptStatus;
  readonly allocations: readonly PaymentReceiptAllocation[];
  readonly voidReason?: string | undefined;
  readonly voidedAt?: Date | undefined;

  private constructor(props: PaymentReceiptProps, status: ReceiptStatus) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.receiptNumber = props.receiptNumber;
    this.customerId = props.customerId;
    this.amount = props.amount;
    this.paymentMethod = props.paymentMethod;
    this.bankAccountId = props.bankAccountId;
    this.receiptDate = props.receiptDate;
    this.reference = props.reference;
    this.notes = props.notes;
    this.status = status;
    this.allocations = props.allocations;
    this.voidReason = props.voidReason;
    this.voidedAt = props.voidedAt;
  }

  static create(props: PaymentReceiptProps): Result<PaymentReceipt, PaymentReceiptError> {
    if (props.allocations.length === 0) {
      return err({ kind: 'EmptyAllocations' });
    }

    const currency = props.amount.currency;
    let sumAllocationsMinor = 0n;

    for (const alloc of props.allocations) {
      if (alloc.amount.currency !== currency) {
        return err({ kind: 'AllocationCurrencyMismatch' });
      }

      if (!alloc.amount.isPositive) {
        return err({ kind: 'NegativeOrZeroAllocation' });
      }

      if (alloc.amount.minorUnits > alloc.previousBalance.minorUnits) {
        return err({ kind: 'AllocationExceedsPreviousBalance' });
      }

      sumAllocationsMinor += alloc.amount.minorUnits;
    }

    if (sumAllocationsMinor !== props.amount.minorUnits) {
      return err({
        kind: 'AllocationSumMismatch',
        expectedMinor: props.amount.minorUnits,
        actualMinor: sumAllocationsMinor,
      });
    }

    const status = props.status ?? 'ACTIVE';

    return ok(new PaymentReceipt(props, status));
  }

  void(reason: string, voidedAt: Date): Result<PaymentReceipt, PaymentReceiptError> {
    if (this.status === 'VOIDED') {
      return err({ kind: 'ReceiptAlreadyVoided' });
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) {
      return err({ kind: 'VoidReasonRequired' });
    }

    return ok(
      new PaymentReceipt(
        {
          ...this,
          status: 'VOIDED',
          voidReason: trimmedReason,
          voidedAt,
        },
        'VOIDED',
      ),
    );
  }
}
