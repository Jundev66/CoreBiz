import { ok, err, type Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import { AggregateRoot, type ProductId, type TenantId, type UserId } from '../shared/entity';
import type { InventoryConflictId } from './pos-ids';

export type ConflictType = 'negative_stock' | 'uncataloged_product';
export type ConflictStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
export type ConflictResolutionType =
  'adjustment_in' | 'catalog_created' | 'linked_existing' | 'dismissed_known';

export type InventoryConflictError =
  | ValidationError
  | { kind: 'ConflictAlreadyClosed'; conflictId: string }
  | { kind: 'EmptyResolutionNotes' };

export interface ConflictMovementRelation {
  readonly id: string;
  readonly stockMovementId: string | null;
  readonly saleId: string | null;
  readonly relationType: 'cause' | 'context' | 'resolution';
  readonly createdAt: Date;
}

export interface InventoryConflictProps {
  readonly id: InventoryConflictId;
  readonly tenantId: TenantId;
  readonly productId: ProductId | null;
  readonly conflictType: ConflictType;
  readonly status: ConflictStatus;
  readonly detectedAt: Date;
  readonly stockBefore: bigint;
  readonly quantityAttempted: bigint;
  readonly stockAfter: bigint;
  readonly shortageQuantity: bigint;
  readonly assignedTo: UserId | null;
  readonly resolutionType: ConflictResolutionType | null;
  readonly resolutionNotes: string | null;
  readonly resolvedBy: UserId | null;
  readonly resolvedAt: Date | null;
  readonly relations: readonly ConflictMovementRelation[];
}

export class InventoryConflict extends AggregateRoot<InventoryConflictId> {
  private _status: ConflictStatus;
  private _assignedTo: UserId | null;
  private _resolutionType: ConflictResolutionType | null;
  private _resolutionNotes: string | null;
  private _resolvedBy: UserId | null;
  private _resolvedAt: Date | null;
  private _relations: ConflictMovementRelation[];

  private constructor(
    id: InventoryConflictId,
    readonly tenantId: TenantId,
    readonly productId: ProductId | null,
    readonly conflictType: ConflictType,
    status: ConflictStatus,
    readonly detectedAt: Date,
    readonly stockBefore: bigint,
    readonly quantityAttempted: bigint,
    readonly stockAfter: bigint,
    readonly shortageQuantity: bigint,
    assignedTo: UserId | null,
    resolutionType: ConflictResolutionType | null,
    resolutionNotes: string | null,
    resolvedBy: UserId | null,
    resolvedAt: Date | null,
    relations: ConflictMovementRelation[],
  ) {
    super(id);
    this._status = status;
    this._assignedTo = assignedTo;
    this._resolutionType = resolutionType;
    this._resolutionNotes = resolutionNotes;
    this._resolvedBy = resolvedBy;
    this._resolvedAt = resolvedAt;
    this._relations = relations;
  }

  static createNegativeStock(params: {
    id: InventoryConflictId;
    tenantId: TenantId;
    productId: ProductId;
    stockBefore: bigint;
    quantityAttempted: bigint;
    stockAfter: bigint;
    shortageQuantity: bigint;
    detectedAt: Date;
    saleId?: string | null;
    stockMovementId?: string | null;
  }): Result<InventoryConflict, InventoryConflictError> {
    const relations: ConflictMovementRelation[] = [];

    if (params.saleId || params.stockMovementId) {
      relations.push({
        id: `${params.id}-cause-1`,
        stockMovementId: params.stockMovementId ?? null,
        saleId: params.saleId ?? null,
        relationType: 'cause',
        createdAt: params.detectedAt,
      });
    }

    const conflict = new InventoryConflict(
      params.id,
      params.tenantId,
      params.productId,
      'negative_stock',
      'open',
      params.detectedAt,
      params.stockBefore,
      params.quantityAttempted,
      params.stockAfter,
      params.shortageQuantity,
      null,
      null,
      null,
      null,
      null,
      relations,
    );

    conflict.recordEvent({
      type: 'pos.conflict.detected',
      occurredAt: params.detectedAt,
      tenantId: conflict.tenantId,
      payload: {
        conflictId: conflict.id,
        conflictType: conflict.conflictType,
        productId: conflict.productId,
        shortageQuantity: conflict.shortageQuantity.toString(),
        stockAfter: conflict.stockAfter.toString(),
      },
    });

    return ok(conflict);
  }

  static createUncatalogedProduct(params: {
    id: InventoryConflictId;
    tenantId: TenantId;
    detectedAt: Date;
    saleId?: string | null;
  }): Result<InventoryConflict, InventoryConflictError> {
    const relations: ConflictMovementRelation[] = [];

    if (params.saleId) {
      relations.push({
        id: `${params.id}-cause-1`,
        stockMovementId: null,
        saleId: params.saleId,
        relationType: 'cause',
        createdAt: params.detectedAt,
      });
    }

    const conflict = new InventoryConflict(
      params.id,
      params.tenantId,
      null,
      'uncataloged_product',
      'open',
      params.detectedAt,
      0n,
      0n,
      0n,
      0n,
      null,
      null,
      null,
      null,
      null,
      relations,
    );

    conflict.recordEvent({
      type: 'pos.conflict.detected',
      occurredAt: params.detectedAt,
      tenantId: conflict.tenantId,
      payload: {
        conflictId: conflict.id,
        conflictType: conflict.conflictType,
      },
    });

    return ok(conflict);
  }

  static rehydrate(props: InventoryConflictProps): InventoryConflict {
    return new InventoryConflict(
      props.id,
      props.tenantId,
      props.productId,
      props.conflictType,
      props.status,
      props.detectedAt,
      props.stockBefore,
      props.quantityAttempted,
      props.stockAfter,
      props.shortageQuantity,
      props.assignedTo,
      props.resolutionType,
      props.resolutionNotes,
      props.resolvedBy,
      props.resolvedAt,
      [...props.relations],
    );
  }

  get status(): ConflictStatus {
    return this._status;
  }

  get assignedTo(): UserId | null {
    return this._assignedTo;
  }

  get resolutionType(): ConflictResolutionType | null {
    return this._resolutionType;
  }

  get resolutionNotes(): string | null {
    return this._resolutionNotes;
  }

  get resolvedBy(): UserId | null {
    return this._resolvedBy;
  }

  get resolvedAt(): Date | null {
    return this._resolvedAt;
  }

  get relations(): readonly ConflictMovementRelation[] {
    return this._relations;
  }

  assignTo(userId: UserId): Result<void, InventoryConflictError> {
    if (this._status === 'resolved' || this._status === 'dismissed') {
      return err({ kind: 'ConflictAlreadyClosed', conflictId: this.id });
    }
    this._assignedTo = userId;
    this._status = 'investigating';
    return ok(undefined);
  }

  resolve(params: {
    resolutionType: ConflictResolutionType;
    notes: string;
    resolvedBy: UserId;
    resolvedAt: Date;
    resolutionMovementId?: string | null;
  }): Result<void, InventoryConflictError> {
    if (this._status === 'resolved' || this._status === 'dismissed') {
      return err({ kind: 'ConflictAlreadyClosed', conflictId: this.id });
    }

    const trimmedNotes = params.notes.trim();
    if (trimmedNotes.length === 0) {
      return err({ kind: 'EmptyResolutionNotes' });
    }

    if (params.resolutionMovementId) {
      this._relations.push({
        id: `${this.id}-res-${this._relations.length + 1}`,
        stockMovementId: params.resolutionMovementId,
        saleId: null,
        relationType: 'resolution',
        createdAt: params.resolvedAt,
      });
    }

    this._status = 'resolved';
    this._resolutionType = params.resolutionType;
    this._resolutionNotes = trimmedNotes;
    this._resolvedBy = params.resolvedBy;
    this._resolvedAt = params.resolvedAt;

    this.recordEvent({
      type: 'pos.conflict.resolved',
      occurredAt: params.resolvedAt,
      tenantId: this.tenantId,
      payload: {
        conflictId: this.id,
        resolutionType: this._resolutionType,
        resolvedBy: this._resolvedBy,
        notes: this._resolutionNotes,
      },
    });

    return ok(undefined);
  }

  dismiss(params: {
    notes: string;
    resolvedBy: UserId;
    resolvedAt: Date;
  }): Result<void, InventoryConflictError> {
    if (this._status === 'resolved' || this._status === 'dismissed') {
      return err({ kind: 'ConflictAlreadyClosed', conflictId: this.id });
    }

    const trimmedNotes = params.notes.trim();
    if (trimmedNotes.length === 0) {
      return err({ kind: 'EmptyResolutionNotes' });
    }

    this._status = 'dismissed';
    this._resolutionType = 'dismissed_known';
    this._resolutionNotes = trimmedNotes;
    this._resolvedBy = params.resolvedBy;
    this._resolvedAt = params.resolvedAt;

    this.recordEvent({
      type: 'pos.conflict.dismissed',
      occurredAt: params.resolvedAt,
      tenantId: this.tenantId,
      payload: {
        conflictId: this.id,
        resolvedBy: this._resolvedBy,
        notes: this._resolutionNotes,
      },
    });

    return ok(undefined);
  }
}
