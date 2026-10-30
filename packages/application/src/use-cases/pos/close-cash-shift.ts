import {
  ok,
  err,
  can,
  asId,
  Money,
  type Result,
  type PosShiftId,
  type CashShiftError,
  type UserId,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

export interface CloseCashShiftInput {
  readonly shiftId: string;
  readonly declaredCashMinor: string;
  readonly notes?: string | null;
  readonly closedAt?: string;
}

export type CloseCashShiftError =
  { kind: 'Forbidden' } | { kind: 'ShiftNotFound'; shiftId: string } | CashShiftError;

export interface CloseCashShiftOutput {
  readonly shiftId: string;
  readonly declaredCashMinor: string;
  readonly systemCashMinor: string;
  readonly cashVarianceMinor: string;
  readonly closedAt: string;
}

export interface CloseCashShiftDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeCloseCashShift(deps: CloseCashShiftDeps) {
  return async function closeCashShift(
    input: CloseCashShiftInput,
  ): Promise<Result<CloseCashShiftOutput, CloseCashShiftError>> {
    if (!can(deps.ctx.actor, 'payment:receive')) {
      return err({ kind: 'Forbidden' });
    }

    const shiftId: PosShiftId = asId<PosShiftId>(input.shiftId);
    const closedAt = input.closedAt ? new Date(input.closedAt) : deps.clock.now();

    return deps.uow.run(async (repos) => {
      const shift = await repos.cashShifts.findById(shiftId);
      if (!shift) {
        return err({ kind: 'ShiftNotFound', shiftId: input.shiftId });
      }

      const declaredCash = Money.fromMinor(
        BigInt(input.declaredCashMinor),
        shift.initialFloat.currency,
      );

      const closeResult = shift.close({
        declaredCash,
        closedByUserId: asId<UserId>(deps.ctx.actor.userId),
        closedAt,
        notes: input.notes ?? null,
      });

      if (!closeResult.ok) {
        return closeResult;
      }

      await repos.cashShifts.save(shift);

      await repos.audit.record({
        action: 'pos.shift.closed',
        entityType: 'pos_cash_shift',
        entityId: shift.id,
        summary: {
          declaredCashMinor: shift.declaredCash?.minorUnits.toString(),
          systemCashMinor: shift.systemCash?.minorUnits.toString(),
          cashVarianceMinor: shift.cashVariance?.minorUnits.toString(),
          notes: shift.notes,
        },
      });

      return ok({
        shiftId: shift.id,
        declaredCashMinor: shift.declaredCash!.minorUnits.toString(),
        systemCashMinor: shift.systemCash!.minorUnits.toString(),
        cashVarianceMinor: shift.cashVariance!.minorUnits.toString(),
        closedAt: shift.closedAt!.toISOString(),
      });
    });
  };
}
