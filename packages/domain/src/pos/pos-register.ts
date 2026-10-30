import { ok, err, type Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import type { TenantId } from '../shared/entity';
import type { PosRegisterId } from './pos-ids';

export type PosRegisterStatus = 'active' | 'inactive';

export type PosRegisterError =
  ValidationError | { kind: 'InvalidRegisterState'; currentStatus: PosRegisterStatus };

export interface PosRegisterProps {
  readonly id: PosRegisterId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly code: string;
  readonly status: PosRegisterStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class PosRegister {
  private _status: PosRegisterStatus;
  private _name: string;
  private _updatedAt: Date;

  private constructor(
    readonly id: PosRegisterId,
    readonly tenantId: TenantId,
    name: string,
    readonly code: string,
    status: PosRegisterStatus,
    readonly createdAt: Date,
    updatedAt: Date,
  ) {
    this._name = name;
    this._status = status;
    this._updatedAt = updatedAt;
  }

  static create(params: {
    id: PosRegisterId;
    tenantId: TenantId;
    name: string;
    code: string;
    now: Date;
  }): Result<PosRegister, PosRegisterError> {
    const trimmedName = params.name.trim();
    if (trimmedName.length === 0) {
      return err({
        kind: 'Required',
        field: 'name',
      });
    }
    if (trimmedName.length > 100) {
      return err({
        kind: 'TooLong',
        field: 'name',
        max: 100,
      });
    }

    const trimmedCode = params.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,20}$/.test(trimmedCode)) {
      return err({
        kind: 'InvalidFormat',
        field: 'code',
        expected: '^[A-Z0-9_-]{2,20}$',
      });
    }

    return ok(
      new PosRegister(
        params.id,
        params.tenantId,
        trimmedName,
        trimmedCode,
        'active',
        params.now,
        params.now,
      ),
    );
  }

  static rehydrate(props: PosRegisterProps): PosRegister {
    return new PosRegister(
      props.id,
      props.tenantId,
      props.name,
      props.code,
      props.status,
      props.createdAt,
      props.updatedAt,
    );
  }

  get name(): string {
    return this._name;
  }

  get status(): PosRegisterStatus {
    return this._status;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  deactivate(now: Date): void {
    this._status = 'inactive';
    this._updatedAt = now;
  }

  activate(now: Date): void {
    this._status = 'active';
    this._updatedAt = now;
  }

  rename(newName: string, now: Date): Result<void, PosRegisterError> {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      return err({
        kind: 'Required',
        field: 'name',
      });
    }
    if (trimmed.length > 100) {
      return err({
        kind: 'TooLong',
        field: 'name',
        max: 100,
      });
    }
    this._name = trimmed;
    this._updatedAt = now;
    return ok(undefined);
  }
}
