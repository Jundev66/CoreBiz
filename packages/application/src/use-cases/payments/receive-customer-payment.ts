import {
  ok,
  err,
  can,
  asId,
  Payment,
  Money,
  ExchangeRate,
  type Result,
  type CustomerId,
  type DeliveryNoteId,
  type PaymentId,
  type PaymentMethod,
  type PaymentError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

export interface ReceiveCustomerPaymentInput {
  readonly customerId: string;
  readonly amount: string;
  readonly paymentMethod: PaymentMethod;
  readonly reference?: string | null;
  readonly notes?: string | null;
  readonly allocations: readonly {
    readonly deliveryNoteId: string;
    readonly amount: string;
  }[];
}

export type ReceiveCustomerPaymentError =
  | { kind: 'Forbidden' }
  | { kind: 'CustomerNotFound'; customerId: string }
  | { kind: 'DeliveryNoteNotFound'; deliveryNoteId: string }
  | { kind: 'DeliveryNoteCustomerMismatch'; deliveryNoteId: string }
  | { kind: 'DeliveryNoteVoided'; deliveryNoteId: string }
  | { kind: 'AllocationExceedsBalance'; deliveryNoteId: string; balance: string; requested: string }
  | { kind: 'InvalidAmount'; raw: string }
  | { kind: 'NoExchangeRate' }
  | PaymentError;

export interface ReceiveCustomerPaymentOutput {
  readonly id: string;
  readonly number: string;
  readonly amount: string;
  readonly currency: string;
}

export interface ReceiveCustomerPaymentDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeReceiveCustomerPayment(deps: ReceiveCustomerPaymentDeps) {
  return async function receiveCustomerPayment(
    input: ReceiveCustomerPaymentInput,
  ): Promise<Result<ReceiveCustomerPaymentOutput, ReceiveCustomerPaymentError>> {
    if (!can(deps.ctx.actor, 'payment:receive')) {
      return err({ kind: 'Forbidden' });
    }

    const { baseCurrency, exchangeRateScaled, exchangeRateAt } = deps.ctx.settings;
    if (exchangeRateScaled === null || exchangeRateAt === null) {
      return err({ kind: 'NoExchangeRate' });
    }

    const exchangeRate = ExchangeRate.fromScaled(
      exchangeRateScaled,
      baseCurrency,
      baseCurrency === 'USD' ? 'VES' : 'USD',
      exchangeRateAt,
    );

    const amountResult = Money.of(input.amount, baseCurrency);
    if (!amountResult.ok) {
      return err({ kind: 'InvalidAmount', raw: input.amount });
    }
    const paymentAmount = amountResult.value;

    return deps.uow.run(async (repos) => {
      const customer = await repos.customers.findById(asId<CustomerId>(input.customerId));
      if (!customer) {
        return err({ kind: 'CustomerNotFound', customerId: input.customerId });
      }

      const domainAllocations: { deliveryNoteId: DeliveryNoteId; amount: Money }[] = [];

      for (const alloc of input.allocations) {
        const noteId = asId<DeliveryNoteId>(alloc.deliveryNoteId);
        const note = await repos.deliveryNotes.findById(noteId);
        if (!note) {
          return err({ kind: 'DeliveryNoteNotFound', deliveryNoteId: alloc.deliveryNoteId });
        }

        if (note.customerId !== customer.id) {
          return err({
            kind: 'DeliveryNoteCustomerMismatch',
            deliveryNoteId: alloc.deliveryNoteId,
          });
        }

        if (note.isVoided) {
          return err({ kind: 'DeliveryNoteVoided', deliveryNoteId: alloc.deliveryNoteId });
        }

        const allocAmountResult = Money.of(alloc.amount, baseCurrency);
        if (!allocAmountResult.ok) {
          return err({ kind: 'InvalidAmount', raw: alloc.amount });
        }
        const allocAmount = allocAmountResult.value;

        // Comprobar que no exceda el saldo pendiente de esta nota
        const noteBalance = await repos.payments.outstandingBalanceForDeliveryNote(noteId);
        const comparison = allocAmount.compare(noteBalance);
        if (!comparison.ok || comparison.value > 0) {
          return err({
            kind: 'AllocationExceedsBalance',
            deliveryNoteId: alloc.deliveryNoteId,
            balance: noteBalance.toString(),
            requested: allocAmount.toString(),
          });
        }

        domainAllocations.push({ deliveryNoteId: noteId, amount: allocAmount });
      }

      // Consumir el correlativo REC-XXXXXX dentro de la transaccion
      const number = await repos.sequences.next('payment');

      const paymentResult = Payment.receive({
        id: asId<PaymentId>(deps.ids.next()),
        tenantId: deps.ctx.tenantId,
        number,
        customerId: customer.id,
        amount: paymentAmount,
        currency: baseCurrency,
        exchangeRate,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        paidAt: deps.clock.now(),
        allocations: domainAllocations,
      });

      if (!paymentResult.ok) return paymentResult;
      const payment = paymentResult.value;

      await repos.payments.save(payment);

      await repos.audit.record({
        action: 'payment.received',
        entityType: 'payment',
        entityId: payment.id,
        summary: {
          number: payment.number,
          customer: customer.name,
          amount: payment.amount.toString(),
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
          allocationsCount: payment.allocations.length,
        },
      });

      return ok({
        id: payment.id,
        number: payment.number,
        amount: payment.amount.toString(),
        currency: payment.currency,
      });
    });
  };
}
