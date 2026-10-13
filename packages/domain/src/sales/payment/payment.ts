import { ok, err, type Result } from '../../shared/result';
import type { ValidationError } from '../../shared/errors';
import {
  AggregateRoot,
  type CustomerId,
  type DeliveryNoteId,
  type PaymentId,
  type TenantId,
} from '../../shared/entity';
import { Money, type Currency } from '../../shared/value-objects/money';
import { type ExchangeRate } from '../../shared/value-objects/exchange-rate';

/**
 * RECIBO DE COBRO — documento interno NO FISCAL.
 *
 * Registra el ingreso de dinero y la amortizacion de saldos pendientes de una o varias
 * notas de entrega emitidas.
 *
 * Sigue la convencion del ADR 003: documento interno, sin valor fiscal, correlativo REC-XXXXXX.
 */

export type PaymentStatus = 'applied' | 'voided';

export type PaymentMethod = 'cash_usd' | 'cash_ves' | 'bank_transfer' | 'mobile_pay' | 'other';

export type PaymentError =
  | ValidationError
  | { kind: 'NoAllocations' }
  | { kind: 'AllocationMismatch'; expected: string; actual: string }
  | { kind: 'CurrencyMismatch'; expected: Currency; actual: Currency }
  | { kind: 'AlreadyVoided' }
  | { kind: 'InvalidAmount' };

export interface PaymentAllocation {
  readonly deliveryNoteId: DeliveryNoteId;
  readonly amount: Money;
}

export interface PaymentProps {
  readonly tenantId: TenantId;
  readonly number: string;
  readonly customerId: CustomerId;
  readonly amount: Money;
  readonly currency: Currency;
  readonly exchangeRate: ExchangeRate;
  readonly paymentMethod: PaymentMethod;
  readonly reference: string | null;
  readonly status: PaymentStatus;
  readonly notes: string | null;
  readonly paidAt: Date;
  readonly allocations: readonly PaymentAllocation[];
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
}

export class Payment extends AggregateRoot<PaymentId> {
  private constructor(
    id: PaymentId,
    private props: PaymentProps,
  ) {
    super(id);
  }

  static receive(input: {
    id: PaymentId;
    tenantId: TenantId;
    number: string;
    customerId: CustomerId;
    amount: Money;
    currency: Currency;
    exchangeRate: ExchangeRate;
    paymentMethod: PaymentMethod;
    reference?: string | null;
    notes?: string | null;
    paidAt: Date;
    allocations: readonly PaymentAllocation[];
  }): Result<Payment, PaymentError> {
    const number = input.number.trim();
    if (number.length === 0) {
      return err({ kind: 'Required', field: 'number' });
    }

    if (!input.amount.isPositive) {
      return err({ kind: 'OutOfRange', field: 'amount', min: 0 });
    }

    if (input.amount.currency !== input.currency) {
      return err({
        kind: 'CurrencyMismatch',
        expected: input.currency,
        actual: input.amount.currency,
      });
    }

    if (input.allocations.length === 0) {
      return err({ kind: 'NoAllocations' });
    }

    for (const alloc of input.allocations) {
      if (!alloc.amount.isPositive) {
        return err({ kind: 'OutOfRange', field: 'allocation.amount', min: 0 });
      }
      if (alloc.amount.currency !== input.currency) {
        return err({
          kind: 'CurrencyMismatch',
          expected: input.currency,
          actual: alloc.amount.currency,
        });
      }
    }

    // La suma de las imputaciones DEBE coincidir exactamente con el total del cobro.
    // Ni un centimo mas, ni un centimo menos.
    const sumResult = Money.sum(
      input.allocations.map((a) => a.amount),
      input.currency,
    );
    if (!sumResult.ok) {
      return err({ kind: 'InvalidFormat', field: 'allocationsSum', expected: input.currency });
    }

    const diff = sumResult.value.compare(input.amount);
    if (!diff.ok || diff.value !== 0) {
      return err({
        kind: 'AllocationMismatch',
        expected: input.amount.toString(),
        actual: sumResult.value.toString(),
      });
    }

    const payment = new Payment(input.id, {
      tenantId: input.tenantId,
      number,
      customerId: input.customerId,
      amount: input.amount,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      paymentMethod: input.paymentMethod,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      status: 'applied',
      paidAt: input.paidAt,
      allocations: [...input.allocations],
      voidedAt: null,
      voidReason: null,
    });

    payment.recordEvent({
      type: 'payment.received',
      occurredAt: input.paidAt,
      tenantId: input.tenantId,
      payload: {
        paymentId: input.id,
        number,
        customerId: input.customerId,
        amount: input.amount.toString(),
        currency: input.currency,
      },
    });

    return ok(payment);
  }

  static rehydrate(id: PaymentId, props: PaymentProps): Payment {
    return new Payment(id, props);
  }

  void(reason: string, at: Date): Result<void, PaymentError> {
    if (this.props.status === 'voided') {
      return err({ kind: 'AlreadyVoided' });
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) {
      return err({ kind: 'Required', field: 'reason' });
    }
    if (trimmedReason.length < 3) {
      return err({ kind: 'TooShort', field: 'reason', min: 3 });
    }

    this.props = {
      ...this.props,
      status: 'voided',
      voidedAt: at,
      voidReason: trimmedReason,
    };

    this.recordEvent({
      type: 'payment.voided',
      occurredAt: at,
      tenantId: this.props.tenantId,
      payload: {
        paymentId: this.id,
        number: this.props.number,
        reason: trimmedReason,
      },
    });

    return ok(undefined);
  }

  get tenantId(): TenantId {
    return this.props.tenantId;
  }
  get number(): string {
    return this.props.number;
  }
  get customerId(): CustomerId {
    return this.props.customerId;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get currency(): Currency {
    return this.props.currency;
  }
  get exchangeRate(): ExchangeRate {
    return this.props.exchangeRate;
  }
  get paymentMethod(): PaymentMethod {
    return this.props.paymentMethod;
  }
  get reference(): string | null {
    return this.props.reference;
  }
  get status(): PaymentStatus {
    return this.props.status;
  }
  get isVoided(): boolean {
    return this.props.status === 'voided';
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get paidAt(): Date {
    return this.props.paidAt;
  }
  get allocations(): readonly PaymentAllocation[] {
    return this.props.allocations;
  }
  get voidedAt(): Date | null {
    return this.props.voidedAt;
  }
  get voidReason(): string | null {
    return this.props.voidReason;
  }

  snapshot(): PaymentProps & { id: PaymentId } {
    return { id: this.id, ...this.props };
  }
}
