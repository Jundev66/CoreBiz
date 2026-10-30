import { ok, err, type Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import type { TenantId } from '../shared/entity';
import type { PosDeviceId } from './pos-ids';

export type PosDeviceStatus = 'pending' | 'active' | 'revoked';

export type PosDeviceError =
  | ValidationError
  | { kind: 'DeviceAlreadyRevoked'; deviceId: string }
  | { kind: 'DeviceNotActive'; status: PosDeviceStatus };

export interface PosDeviceProps {
  readonly id: PosDeviceId;
  readonly tenantId: TenantId;
  readonly installationId: string;
  readonly name: string;
  readonly platform: string | null;
  readonly browser: string | null;
  readonly status: PosDeviceStatus;
  readonly deviceTokenHash: string | null;
  readonly registeredAt: Date;
  readonly lastSeenAt: Date | null;
}

export class PosDevice {
  private _status: PosDeviceStatus;
  private _name: string;
  private _deviceTokenHash: string | null;
  private _lastSeenAt: Date | null;

  private constructor(
    readonly id: PosDeviceId,
    readonly tenantId: TenantId,
    readonly installationId: string,
    name: string,
    readonly platform: string | null,
    readonly browser: string | null,
    status: PosDeviceStatus,
    deviceTokenHash: string | null,
    readonly registeredAt: Date,
    lastSeenAt: Date | null,
  ) {
    this._name = name;
    this._status = status;
    this._deviceTokenHash = deviceTokenHash;
    this._lastSeenAt = lastSeenAt;
  }

  static create(params: {
    id: PosDeviceId;
    tenantId: TenantId;
    installationId: string;
    name: string;
    now: Date;
    platform?: string | null;
    browser?: string | null;
  }): Result<PosDevice, PosDeviceError> {
    const trimmedName = params.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 100) {
      return err({
        kind: 'FieldTooLong',
        field: 'name',
        max: 100,
        actual: trimmedName.length,
      });
    }

    const trimmedInstallId = params.installationId.trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(trimmedInstallId)) {
      return err({
        kind: 'FieldRequired',
        field: 'installationId',
      });
    }

    return ok(
      new PosDevice(
        params.id,
        params.tenantId,
        trimmedInstallId,
        trimmedName,
        params.platform ?? null,
        params.browser ?? null,
        'pending',
        null,
        params.now,
        null,
      ),
    );
  }

  static rehydrate(props: PosDeviceProps): PosDevice {
    return new PosDevice(
      props.id,
      props.tenantId,
      props.installationId,
      props.name,
      props.platform,
      props.browser,
      props.status,
      props.deviceTokenHash,
      props.registeredAt,
      props.lastSeenAt,
    );
  }

  get status(): PosDeviceStatus {
    return this._status;
  }

  get name(): string {
    return this._name;
  }

  get deviceTokenHash(): string | null {
    return this._deviceTokenHash;
  }

  get lastSeenAt(): Date | null {
    return this._lastSeenAt;
  }

  authorize(tokenHash: string, at: Date): Result<void, PosDeviceError> {
    if (this._status === 'revoked') {
      return err({ kind: 'DeviceAlreadyRevoked', deviceId: this.id });
    }
    this._status = 'active';
    this._deviceTokenHash = tokenHash;
    this._lastSeenAt = at;
    return ok(undefined);
  }

  revoke(): void {
    this._status = 'revoked';
    this._deviceTokenHash = null;
  }

  touch(at: Date): void {
    this._lastSeenAt = at;
  }
}
