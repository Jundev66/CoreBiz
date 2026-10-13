import {
  ok,
  err,
  can,
  asId,
  type Result,
  type PaymentId,
  type PaymentError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

export interface VoidCustomerPaymentInput {
  readonly paymentId: string;
  readonly reason: string;
}

export type VoidCustomerPaymentError =
  { kind: 'Forbidden' } | { kind: 'PaymentNotFound'; paymentId: string } | PaymentError;

export interface VoidCustomerPaymentDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeVoidCustomerPayment(deps: VoidCustomerPaymentDeps) {
  return async function voidCustomerPayment(
    input: VoidCustomerPaymentInput,
  ): Promise<Result<{ id: string; number: string }, VoidCustomerPaymentError>> {
    if (!can(deps.ctx.actor, 'payment:void')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      const paymentId = asId<PaymentId>(input.paymentId);
      const payment = await repos.payments.findById(paymentId);
      if (!payment) {
        return err({ kind: 'PaymentNotFound', paymentId: input.paymentId });
      }

      const voidResult = payment.void(input.reason, deps.clock.now());
      if (!voidResult.ok) return voidResult;

      await repos.payments.save(payment);

      await repos.audit.record({
        action: 'payment.voided',
        entityType: 'payment',
        entityId: payment.id,
        summary: {
          number: payment.number,
          reason: input.reason.trim(),
        },
      });

      return ok({
        id: payment.id,
        number: payment.number,
      });
    });
  };
}
