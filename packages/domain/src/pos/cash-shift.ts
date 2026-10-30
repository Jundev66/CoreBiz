import { ok, err, type Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import { AggregateRoot, type TenantId, type UserId } from '../shared/entity';
import { Money } from '../shared/value-objects/money';
import type { PosDeviceId, PosRegisterId, PosShiftId } from './pos-ids';

export type CashShiftStatus = 'open' | 'closed' | 'audited';
export type CashMovementType = 'cash_in' | 'cash_out';

export interface CashMovement {
  readonly id: string;
  readonly type: CashMovementType;
  readonly amount: Money;
  readonly reason: string;
  readonly occurredAt: Date;
}

export type CashShiftError =
  | ValidationError
  | { kind: 'ShiftNotOpen'; currentStatus: CashShiftStatus }
  | { kind: 'ShiftAlreadyClosed'; shiftId: string }
  | { kind: 'NegativeFloat'; amountMinor: bigint }
  | { kind: 'InsufficientCashInShift'; requestedMinor: bigint; availableMinor: bigint }
  | { kind: 'CurrencyMismatch'; left: string; right: string };

export interface CashShiftProps {
  readonly id: PosShiftId;
  readonly tenantId: TenantId;
  readonly registerId: PosRegisterId;
  readonly deviceId: PosDeviceId;
  readonly openedByUserId: UserId;
  readonly openedAt: Date;
  readonly initialFloat: Money;
  readonly status: CashShiftStatus;
  readonly closedByUserId: UserId | null;
  readonly closedAt: Date | null;
  readonly declaredCash: Money | null;
  readonly systemCash: Money | null;
  readonly cashVariance: Money | null;
  readonly notes: string | null;
  readonly movements: readonly CashMovement[];
  readonly totalCashSales: Money;
}

export class CashShift extends AggregateRoot<PosShiftId> {
  private _status: CashShiftStatus;
  private _closedByUserId: UserId | null;
  private _closedAt: Date | null;
  private _declaredCash: Money | null;
  private _systemCash: Money | null;
  private _cashVariance: Money | null;
  private _notes: string | null;
  private _movements: CashMovement[];
  private _totalCashSales: Money;

  private constructor(
    id: PosShiftId,
    readonly tenantId: TenantId,
    readonly registerId: PosRegisterId,
    readonly deviceId: PosDeviceId,
    readonly openedByUserId: UserId,
    readonly openedAt: Date,
    readonly initialFloat: Money,
    status: CashShiftStatus,
    closedByUserId: UserId | null,
    closedAt: Date | null,
    declaredCash: Money | null,
    systemCash: Money | null,
    cashVariance: Money | null,
    notes: string | null,
    movements: CashMovement[],
    totalCashSales: Money,
  ) {
    super(id);
    this._status = status;
    this._closedByUserId = closedByUserId;
    this._closedAt = closedAt;
    this._declaredCash = declaredCash;
    this._systemCash = systemCash;
    this._cashVariance = cashVariance;
    this._notes = notes;
    this._movements = movements;
    this._totalCashSales = totalCashSales;
  }

  static open(params: {
    id: PosShiftId;
    tenantId: TenantId;
    registerId: PosRegisterId;
    deviceId: PosDeviceId;
    openedByUserId: UserId;
    initialFloat: Money;
    now: Date;
  }): Result<CashShift, CashShiftError> {
    if (params.initialFloat.isNegative) {
      return err({
        kind: 'NegativeFloat',
        amountMinor: params.initialFloat.minorUnits,
      });
    }

    const shift = new CashShift(
      params.id,
      params.tenantId,
      params.registerId,
      params.deviceId,
      params.openedByUserId,
      params.now,
      params.initialFloat,
      'open',
      null,
      null,
      null,
      null,
      null,
      null,
      [],
      Money.zero(params.initialFloat.currency),
    );

    shift.recordEvent({
      type: 'pos.shift.opened',
      occurredAt: shift.openedAt,
      tenantId: shift.tenantId,
      payload: {
        shiftId: shift.id,
        registerId: shift.registerId,
        deviceId: shift.deviceId,
        openedByUserId: shift.openedByUserId,
        initialFloatMinor: shift.initialFloat.minorUnits.toString(),
        currency: shift.initialFloat.currency,
      },
    });

    return ok(shift);
  }

  static rehydrate(props: CashShiftProps): CashShift {
    return new CashShift(
      props.id,
      props.tenantId,
      props.registerId,
      props.deviceId,
      props.openedByUserId,
      props.openedAt,
      props.initialFloat,
      props.status,
      props.closedByUserId,
      props.closedAt,
      props.declaredCash,
      props.systemCash,
      props.cashVariance,
      props.notes,
      [...props.movements],
      props.totalCashSales,
    );
  }

  get status(): CashShiftStatus {
    return this._status;
  }

  get closedByUserId(): UserId | null {
    return this._closedByUserId;
  }

  get closedAt(): Date | null {
    return this._closedAt;
  }

  get declaredCash(): Money | null {
    return this._declaredCash;
  }

  get systemCash(): Money | null {
    return this._systemCash;
  }

  get cashVariance(): Money | null {
    return this._cashVariance;
  }

  get notes(): string | null {
    return this._notes;
  }

  get movements(): readonly CashMovement[] {
    return this._movements;
  }

  get totalCashSales(): Money {
    return this._totalCashSales;
  }

  currentExpectedCash(): Money {
    let balance = this.initialFloat.minorUnits + this._totalCashSales.minorUnits;
    for (const mov of this._movements) {
      if (mov.type === 'cash_in') {
        balance += mov.amount.minorUnits;
      } else {
        balance -= mov.amount.minorUnits;
      }
    }
    return Money.fromMinor(balance, this.initialFloat.currency);
  }

  recordCashMovement(params: {
    id: string;
    type: CashMovementType;
    amount: Money;
    reason: string;
    occurredAt: Date;
  }): Result<void, CashShiftError> {
    if (this._status !== 'open') {
      return err({ kind: 'ShiftNotOpen', currentStatus: this._status });
    }

    if (params.amount.currency !== this.initialFloat.currency) {
      return err({
        kind: 'CurrencyMismatch',
        left: params.amount.currency,
        right: this.initialFloat.currency,
      });
    }

    if (params.amount.isNegative || params.amount.isZero) {
      return err({
        kind: 'NegativeFloat',
        amountMinor: params.amount.minorUnits,
      });
    }

    if (params.type === 'cash_out') {
      const current = this.currentExpectedCash();
      if (params.amount.minorUnits > current.minorUnits) {
        return err({
          kind: 'InsufficientCashInShift',
          requestedMinor: params.amount.minorUnits,
          availableMinor: current.minorUnits,
        });
      }
    }

    const movement: CashMovement = {
      id: params.id,
      type: params.type,
      amount: params.amount,
      reason: params.reason.trim(),
      occurredAt: params.occurredAt,
    };

    this._movements.push(movement);

    this.recordEvent({
      type: 'pos.shift.cash_movement_recorded',
      occurredAt: movement.occurredAt,
      tenantId: this.tenantId,
      payload: {
        shiftId: this.id,
        movementId: movement.id,
        movementType: movement.type,
        amountMinor: movement.amount.minorUnits.toString(),
        currency: movement.amount.currency,
        reason: movement.reason,
      },
    });

    return ok(undefined);
  }

  recordCashSale(amount: Money): Result<void, CashShiftError> {
    if (this._status !== 'open') {
      return err({ kind: 'ShiftNotOpen', currentStatus: this._status });
    }

    const sumResult = this._totalCashSales.add(amount);
    if (!sumResult.ok) {
      return err({
        kind: 'CurrencyMismatch',
        left: amount.currency,
        right: this._totalCashSales.currency,
      });
    }

    this._totalCashSales = sumResult.value;
    return ok(undefined);
  }

  close(params: {
    declaredCash: Money;
    closedByUserId: UserId;
    closedAt: Date;
    notes?: string | null;
  }): Result<void, CashShiftError> {
    if (this._status !== 'open') {
      return err({ kind: 'ShiftAlreadyClosed', shiftId: this.id });
    }

    if (params.declaredCash.currency !== this.initialFloat.currency) {
      return err({
        kind: 'CurrencyMismatch',
        left: params.declaredCash.currency,
        right: this.initialFloat.currency,
      });
    }

    if (params.declaredCash.isNegative) {
      return err({
        kind: 'NegativeFloat',
        amountMinor: params.declaredCash.minorUnits,
      });
    }

    const system = this.currentExpectedCash();
    const varianceMinor = params.declaredCash.minorUnits - system.minorUnits;
    const variance = Money.fromMinor(varianceMinor, this.initialFloat.currency);

    this._status = 'closed';
    this._closedByUserId = params.closedByUserId;
    this._closedAt = params.closedAt;
    this._declaredCash = params.declaredCash;
    this._systemCash = system;
    this._cashVariance = variance;
    this._notes = params.notes?.trim() || null;

    this.recordEvent({
      type: 'pos.shift.closed',
      occurredAt: this._closedAt,
      tenantId: this.tenantId,
      payload: {
        shiftId: this.id,
        closedByUserId: this._closedByUserId,
        declaredCashMinor: this._declaredCash.minorUnits.toString(),
        systemCashMinor: this._systemCash.minorUnits.toString(),
        varianceMinor: this._cashVariance.minorUnits.toString(),
        currency: this.initialFloat.currency,
      },
    });

    return ok(undefined);
  }
}
