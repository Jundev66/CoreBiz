import {
  ok,
  err,
  can,
  asId,
  CashShift,
  Money,
  type Result,
  type PosShiftId,
  type PosRegisterId,
  type PosDeviceId,
  type CashShiftError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

export interface OpenCashShiftInput {
  readonly shiftId?: string;
  readonly registerId: string;
  readonly deviceId: string;
  readonly initialFloatMinor: string;
  readonly currency: 'USD' | 'VES';
}

export type OpenCashShiftError =
  | { kind: 'Forbidden' }
  | { kind: 'RegisterNotFound'; registerId: string }
  | { kind: 'RegisterNotActive'; registerId: string }
  | { kind: 'DeviceNotFound'; deviceId: string }
  | { kind: 'DeviceNotActive'; deviceId: string }
  | { kind: 'ShiftAlreadyOpen'; registerId: string }
  | CashShiftError;

export interface OpenCashShiftOutput {
  readonly shiftId: string;
  readonly registerId: string;
  readonly openedAt: string;
  readonly initialFloat: string;
}

export interface OpenCashShiftDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeOpenCashShift(deps: OpenCashShiftDeps) {
  return async function openCashShift(
    input: OpenCashShiftInput,
  ): Promise<Result<OpenCashShiftOutput, OpenCashShiftError>> {
    if (!can(deps.ctx.actor, 'deliveryNotes:create')) {
      return err({ kind: 'Forbidden' });
    }

    const initialFloat = Money.fromMinor(BigInt(input.initialFloatMinor), input.currency);
    const shiftId: PosShiftId = input.shiftId ? asId(input.shiftId) : asId(deps.ids.next());
    const registerId = asId<PosRegisterId>(input.registerId);
    const deviceId = asId<PosDeviceId>(input.deviceId);
    const now = deps.clock.now();

    return deps.uow.run(async (repos) => {
      const register = await repos.posRegisters.findById(registerId);
      if (!register) {
        return err({ kind: 'RegisterNotFound', registerId: input.registerId });
      }
      if (register.status !== 'active') {
        return err({ kind: 'RegisterNotActive', registerId: input.registerId });
      }

      const device = await repos.posDevices.findById(deviceId);
      if (!device) {
        return err({ kind: 'DeviceNotFound', deviceId: input.deviceId });
      }
      if (device.status !== 'active') {
        return err({ kind: 'DeviceNotActive', deviceId: input.deviceId });
      }

      const existingShift = await repos.cashShifts.findActiveByRegisterId(registerId);
      if (existingShift) {
        return err({ kind: 'ShiftAlreadyOpen', registerId: input.registerId });
      }

      const shiftResult = CashShift.open({
        id: shiftId,
        tenantId: deps.ctx.tenantId,
        registerId,
        deviceId,
        openedByUserId: deps.ctx.actor.userId,
        initialFloat,
        now,
      });

      if (!shiftResult.ok) {
        return shiftResult;
      }

      const shift = shiftResult.value;
      await repos.cashShifts.save(shift);

      await repos.audit.record({
        action: 'pos.shift.opened',
        entityType: 'pos_cash_shift',
        entityId: shift.id,
        summary: {
          registerId: shift.registerId,
          deviceId: shift.deviceId,
          initialFloatMinor: input.initialFloatMinor,
          currency: input.currency,
        },
      });

      return ok({
        shiftId: shift.id,
        registerId: shift.registerId,
        openedAt: shift.openedAt.toISOString(),
        initialFloat: initialFloat.minorUnits.toString(),
      });
    });
  };
}
