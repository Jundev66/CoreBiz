import {
  ok,
  err,
  can,
  asId,
  Money,
  type Result,
  type PosShiftId,
  type CashMovementType,
  type CashShiftError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

export interface RecordCashMovementInput {
  readonly movementId?: string;
  readonly shiftId: string;
  readonly type: CashMovementType;
  readonly amountMinor: string;
  readonly currency: 'USD' | 'VES';
  readonly reason: string;
  readonly occurredAt?: string;
}

export type RecordCashMovementError =
  { kind: 'Forbidden' } | { kind: 'ShiftNotFound'; shiftId: string } | CashShiftError;

export interface RecordCashMovementOutput {
  readonly movementId: string;
  readonly shiftId: string;
  readonly currentExpectedCashMinor: string;
}

export interface RecordCashMovementDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeRecordCashMovement(deps: RecordCashMovementDeps) {
  return async function recordCashMovement(
    input: RecordCashMovementInput,
  ): Promise<Result<RecordCashMovementOutput, RecordCashMovementError>> {
    if (!can(deps.ctx.actor, 'deliveryNotes:create')) {
      return err({ kind: 'Forbidden' });
    }

    const shiftId: PosShiftId = asId(input.shiftId);
    const movementId = input.movementId ?? deps.ids.next();
    const amount = Money.fromMinor(BigInt(input.amountMinor), input.currency);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : deps.clock.now();

    return deps.uow.run(async (repos) => {
      const shift = await repos.cashShifts.findById(shiftId);
      if (!shift) {
        return err({ kind: 'ShiftNotFound', shiftId: input.shiftId });
      }

      const movementResult = shift.recordCashMovement({
        id: movementId,
        type: input.type,
        amount,
        reason: input.reason,
        occurredAt,
      });

      if (!movementResult.ok) {
        return movementResult;
      }

      await repos.cashShifts.save(shift);

      await repos.audit.record({
        action: 'pos.shift.cash_movement',
        entityType: 'pos_cash_shift',
        entityId: shift.id,
        summary: {
          movementId,
          type: input.type,
          amountMinor: input.amountMinor,
          reason: input.reason,
        },
      });

      return ok({
        movementId,
        shiftId: shift.id,
        currentExpectedCashMinor: shift.currentExpectedCash().minorUnits.toString(),
      });
    });
  };
}
