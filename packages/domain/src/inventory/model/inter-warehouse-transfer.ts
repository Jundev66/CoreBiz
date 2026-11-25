import { type Quantity } from '../../shared/value-objects/quantity';
import { ok, err, type Result } from '../../shared/result';

export type TransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';

export interface TransferLine {
  readonly productId: string;
  readonly quantity: Quantity;
}

export interface InterWarehouseTransferProps {
  readonly id: string;
  readonly tenantId: string;
  readonly transferNumber: string;
  readonly sourceWarehouseId: string;
  readonly destinationWarehouseId: string;
  readonly status?: TransferStatus | undefined;
  readonly lines: readonly TransferLine[];
  readonly notes?: string | undefined;
  readonly initiatedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly cancelledAt?: Date | undefined;
  readonly cancelReason?: string | undefined;
}

export interface TransferError {
  readonly kind:
    | 'SameSourceAndDestination'
    | 'EmptyTransferLines'
    | 'InvalidTransferLineQuantity'
    | 'InvalidTransferStatusTransition'
    | 'TransferAlreadyFinalized'
    | 'CancelReasonRequired'
    | 'InsufficientWarehouseStock';
  readonly currentStatus?: TransferStatus;
  readonly details?: string | undefined;
}

export class InterWarehouseTransfer {
  readonly id: string;
  readonly tenantId: string;
  readonly transferNumber: string;
  readonly sourceWarehouseId: string;
  readonly destinationWarehouseId: string;
  readonly status: TransferStatus;
  readonly lines: readonly TransferLine[];
  readonly notes?: string | undefined;
  readonly initiatedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly cancelledAt?: Date | undefined;
  readonly cancelReason?: string | undefined;

  private constructor(props: InterWarehouseTransferProps, status: TransferStatus) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.transferNumber = props.transferNumber;
    this.sourceWarehouseId = props.sourceWarehouseId;
    this.destinationWarehouseId = props.destinationWarehouseId;
    this.status = status;
    this.lines = props.lines;
    this.notes = props.notes;
    this.initiatedAt = props.initiatedAt;
    this.completedAt = props.completedAt;
    this.cancelledAt = props.cancelledAt;
    this.cancelReason = props.cancelReason;
  }

  static create(props: InterWarehouseTransferProps): Result<InterWarehouseTransfer, TransferError> {
    if (props.sourceWarehouseId === props.destinationWarehouseId) {
      return err({ kind: 'SameSourceAndDestination' });
    }

    if (props.lines.length === 0) {
      return err({ kind: 'EmptyTransferLines' });
    }

    for (const line of props.lines) {
      if (!line.quantity.isPositive) {
        return err({
          kind: 'InvalidTransferLineQuantity',
          details: `Quantity for product ${line.productId} must be positive`,
        });
      }
    }

    const status = props.status ?? 'DRAFT';

    return ok(new InterWarehouseTransfer(props, status));
  }

  initiate(initiatedAt: Date): Result<InterWarehouseTransfer, TransferError> {
    if (this.status !== 'DRAFT') {
      return err({
        kind: 'InvalidTransferStatusTransition',
        currentStatus: this.status,
      });
    }

    return ok(
      new InterWarehouseTransfer(
        {
          ...this,
          status: 'IN_TRANSIT',
          initiatedAt,
        },
        'IN_TRANSIT',
      ),
    );
  }

  complete(completedAt: Date): Result<InterWarehouseTransfer, TransferError> {
    if (this.status !== 'IN_TRANSIT') {
      return err({
        kind: 'InvalidTransferStatusTransition',
        currentStatus: this.status,
      });
    }

    return ok(
      new InterWarehouseTransfer(
        {
          ...this,
          status: 'COMPLETED',
          completedAt,
        },
        'COMPLETED',
      ),
    );
  }

  cancel(reason: string, cancelledAt: Date): Result<InterWarehouseTransfer, TransferError> {
    if (this.status === 'COMPLETED' || this.status === 'CANCELLED') {
      return err({
        kind: 'TransferAlreadyFinalized',
        currentStatus: this.status,
      });
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) {
      return err({ kind: 'CancelReasonRequired' });
    }

    return ok(
      new InterWarehouseTransfer(
        {
          ...this,
          status: 'CANCELLED',
          cancelledAt,
          cancelReason: trimmedReason,
        },
        'CANCELLED',
      ),
    );
  }
}
