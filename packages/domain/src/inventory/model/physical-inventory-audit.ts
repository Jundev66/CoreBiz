import { Quantity, QUANTITY_SCALE } from '../../shared/value-objects/quantity';
import { Money, type Currency } from '../../shared/value-objects/money';
import { ok, err, type Result } from '../../shared/result';

export type AuditStatus = 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'CANCELLED';

export interface AuditLineProps {
  readonly productId: string;
  readonly theoreticalQuantity: Quantity;
  readonly countedQuantity?: Quantity | null | undefined;
  readonly unitCost: Money;
}

export class AuditLine {
  readonly productId: string;
  readonly theoreticalQuantity: Quantity;
  readonly countedQuantity: Quantity | null;
  readonly discrepancyQuantity: Quantity;
  readonly unitCost: Money;
  readonly discrepancyMonetaryValue: Money;

  constructor(
    productId: string,
    theoreticalQuantity: Quantity,
    countedQuantity: Quantity | null,
    unitCost: Money,
  ) {
    this.productId = productId;
    this.theoreticalQuantity = theoreticalQuantity;
    this.countedQuantity = countedQuantity;
    this.unitCost = unitCost;

    if (countedQuantity === null) {
      this.discrepancyQuantity = Quantity.zero();
      this.discrepancyMonetaryValue = Money.zero(unitCost.currency);
    } else {
      this.discrepancyQuantity = countedQuantity.subtract(theoreticalQuantity);
      this.discrepancyMonetaryValue = unitCost.multiplyScaled(
        this.discrepancyQuantity.scaledValue,
        QUANTITY_SCALE,
      );
    }
  }
}

export interface PhysicalInventoryAuditProps {
  readonly id: string;
  readonly tenantId: string;
  readonly auditNumber: string;
  readonly warehouseId: string;
  readonly blindCount?: boolean | undefined;
  readonly status?: AuditStatus | undefined;
  readonly lines: readonly AuditLine[];
  readonly notes?: string | undefined;
  readonly createdAt: Date;
  readonly reviewedAt?: Date | undefined;
  readonly approvedAt?: Date | undefined;
  readonly cancelledAt?: Date | undefined;
  readonly cancelReason?: string | undefined;
  readonly journalEntryId?: string | undefined;
}

export interface PhysicalInventoryAuditError {
  readonly kind:
    | 'EmptyAuditLines'
    | 'EmptyCounts'
    | 'InvalidStatusTransition'
    | 'AuditAlreadyFinalized'
    | 'CancelReasonRequired'
    | 'ProductNotFoundInAudit'
    | 'AuditNotReadyForApproval';
  readonly currentStatus?: AuditStatus | undefined;
  readonly details?: string | undefined;
}

export class PhysicalInventoryAudit {
  readonly id: string;
  readonly tenantId: string;
  readonly auditNumber: string;
  readonly warehouseId: string;
  readonly blindCount: boolean;
  readonly status: AuditStatus;
  readonly lines: readonly AuditLine[];
  readonly notes?: string | undefined;
  readonly createdAt: Date;
  readonly reviewedAt?: Date | undefined;
  readonly approvedAt?: Date | undefined;
  readonly cancelledAt?: Date | undefined;
  readonly cancelReason?: string | undefined;
  readonly journalEntryId?: string | undefined;

  private constructor(props: PhysicalInventoryAuditProps, status: AuditStatus) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.auditNumber = props.auditNumber;
    this.warehouseId = props.warehouseId;
    this.blindCount = props.blindCount ?? false;
    this.status = status;
    this.lines = props.lines;
    this.notes = props.notes;
    this.createdAt = props.createdAt;
    this.reviewedAt = props.reviewedAt;
    this.approvedAt = props.approvedAt;
    this.cancelledAt = props.cancelledAt;
    this.cancelReason = props.cancelReason;
    this.journalEntryId = props.journalEntryId;
  }

  static create(
    props: PhysicalInventoryAuditProps,
  ): Result<PhysicalInventoryAudit, PhysicalInventoryAuditError> {
    if (props.lines.length === 0) {
      return err({ kind: 'EmptyAuditLines' });
    }

    const status = props.status ?? 'OPEN';
    return ok(new PhysicalInventoryAudit(props, status));
  }

  recordCounts(
    counts: readonly { productId: string; countedQuantity: Quantity }[],
    reviewedAt: Date,
  ): Result<PhysicalInventoryAudit, PhysicalInventoryAuditError> {
    if (this.status !== 'OPEN') {
      return err({
        kind: 'InvalidStatusTransition',
        currentStatus: this.status,
      });
    }

    if (counts.length === 0) {
      return err({ kind: 'EmptyCounts' });
    }

    const countMap = new Map<string, Quantity>();
    for (const c of counts) {
      countMap.set(c.productId, c.countedQuantity);
    }

    const updatedLines: AuditLine[] = [];
    for (const line of this.lines) {
      const counted = countMap.get(line.productId);
      if (counted !== undefined) {
        updatedLines.push(
          new AuditLine(line.productId, line.theoreticalQuantity, counted, line.unitCost),
        );
      } else {
        updatedLines.push(line);
      }
    }

    return ok(
      new PhysicalInventoryAudit(
        {
          id: this.id,
          tenantId: this.tenantId,
          auditNumber: this.auditNumber,
          warehouseId: this.warehouseId,
          blindCount: this.blindCount,
          status: 'IN_REVIEW',
          lines: updatedLines,
          notes: this.notes,
          createdAt: this.createdAt,
          reviewedAt,
          approvedAt: this.approvedAt,
          cancelledAt: this.cancelledAt,
          cancelReason: this.cancelReason,
          journalEntryId: this.journalEntryId,
        },
        'IN_REVIEW',
      ),
    );
  }

  approve(
    journalEntryId: string | undefined,
    approvedAt: Date,
  ): Result<PhysicalInventoryAudit, PhysicalInventoryAuditError> {
    if (this.status !== 'IN_REVIEW') {
      return err({
        kind: 'AuditNotReadyForApproval',
        currentStatus: this.status,
      });
    }

    return ok(
      new PhysicalInventoryAudit(
        {
          id: this.id,
          tenantId: this.tenantId,
          auditNumber: this.auditNumber,
          warehouseId: this.warehouseId,
          blindCount: this.blindCount,
          status: 'APPROVED',
          lines: this.lines,
          notes: this.notes,
          createdAt: this.createdAt,
          reviewedAt: this.reviewedAt,
          approvedAt,
          cancelledAt: this.cancelledAt,
          cancelReason: this.cancelReason,
          journalEntryId,
        },
        'APPROVED',
      ),
    );
  }

  cancel(
    reason: string,
    cancelledAt: Date,
  ): Result<PhysicalInventoryAudit, PhysicalInventoryAuditError> {
    if (this.status === 'APPROVED' || this.status === 'CANCELLED') {
      return err({
        kind: 'AuditAlreadyFinalized',
        currentStatus: this.status,
      });
    }

    if (!reason || reason.trim().length === 0) {
      return err({ kind: 'CancelReasonRequired' });
    }

    return ok(
      new PhysicalInventoryAudit(
        {
          id: this.id,
          tenantId: this.tenantId,
          auditNumber: this.auditNumber,
          warehouseId: this.warehouseId,
          blindCount: this.blindCount,
          status: 'CANCELLED',
          lines: this.lines,
          notes: this.notes,
          createdAt: this.createdAt,
          reviewedAt: this.reviewedAt,
          approvedAt: this.approvedAt,
          cancelledAt,
          cancelReason: reason.trim(),
          journalEntryId: this.journalEntryId,
        },
        'CANCELLED',
      ),
    );
  }

  get hasDiscrepancies(): boolean {
    return this.lines.some((l) => !l.discrepancyQuantity.isZero);
  }

  get currency(): Currency {
    return this.lines[0]?.unitCost.currency ?? 'USD';
  }

  get totalShortageValue(): Money {
    let sum = Money.zero(this.currency);
    for (const line of this.lines) {
      if (line.discrepancyQuantity.isNegative) {
        const absVal = line.discrepancyMonetaryValue.isNegative
          ? line.discrepancyMonetaryValue.negate()
          : line.discrepancyMonetaryValue;
        const res = sum.add(absVal);
        if (res.ok) sum = res.value;
      }
    }
    return sum;
  }

  get totalSurplusValue(): Money {
    let sum = Money.zero(this.currency);
    for (const line of this.lines) {
      if (line.discrepancyQuantity.isPositive) {
        const res = sum.add(line.discrepancyMonetaryValue);
        if (res.ok) sum = res.value;
      }
    }
    return sum;
  }
}
