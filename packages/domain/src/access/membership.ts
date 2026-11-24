import type { Role } from './role';
import { err, ok, type Result } from '../shared/result';

export type MembershipStatus = 'active' | 'invited' | 'suspended';

export interface MembershipProps {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly role: Role;
  readonly status: MembershipStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Membership {
  private constructor(
    private readonly _id: string,
    private readonly _tenantId: string,
    private readonly _userId: string,
    private _role: Role,
    private _status: MembershipStatus,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static create(props: {
    id: string;
    tenantId: string;
    userId: string;
    role: Role;
    status?: MembershipStatus;
    createdAt: Date;
    updatedAt?: Date;
  }): Result<Membership, string> {
    if (!props.id.trim()) {
      return err('Membership ID cannot be empty');
    }
    if (!props.tenantId.trim()) {
      return err('Tenant ID cannot be empty');
    }
    if (!props.userId.trim()) {
      return err('User ID cannot be empty');
    }

    return ok(
      new Membership(
        props.id,
        props.tenantId,
        props.userId,
        props.role,
        props.status ?? 'active',
        props.createdAt,
        props.updatedAt ?? props.createdAt,
      ),
    );
  }

  get id(): string {
    return this._id;
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get userId(): string {
    return this._userId;
  }

  get role(): Role {
    return this._role;
  }

  get status(): MembershipStatus {
    return this._status;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  changeRole(newRole: Role, at?: Date): Result<void, string> {
    if (this._role === newRole) {
      return ok(undefined);
    }
    this._role = newRole;
    if (at) {
      this._updatedAt = at;
    }
    return ok(undefined);
  }

  suspend(at?: Date): Result<void, string> {
    if (this._status === 'suspended') {
      return err('Membership is already suspended');
    }
    this._status = 'suspended';
    if (at) {
      this._updatedAt = at;
    }
    return ok(undefined);
  }

  activate(at?: Date): Result<void, string> {
    if (this._status === 'active') {
      return err('Membership is already active');
    }
    this._status = 'active';
    if (at) {
      this._updatedAt = at;
    }
    return ok(undefined);
  }

  toPrimitives(): MembershipProps {
    return {
      id: this._id,
      tenantId: this._tenantId,
      userId: this._userId,
      role: this._role,
      status: this._status,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
