import { ok, err, type Result } from '@corebiz/shared-kernel';

export type FiscalSequenceDocumentType =
  'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'CONTROL_NUMBER';

export type FiscalSequenceStatus = 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'INACTIVE';

export interface FiscalSequenceError {
  readonly kind:
    | 'InvalidRangeBounds'
    | 'CurrentNumberOutOfRange'
    | 'FiscalSequenceExpired'
    | 'FiscalSequenceExhausted'
    | 'FiscalSequenceInactive'
    | 'ResolutionDateAfterExpiration';
  readonly fromNumber?: bigint;
  readonly toNumber?: bigint;
  readonly currentNumber?: bigint;
  readonly expiresAt?: Date;
}

export interface FiscalSequenceRangeProps {
  readonly id: string;
  readonly tenantId: string;
  readonly jurisdiction: string;
  readonly documentType: FiscalSequenceDocumentType;
  readonly prefix: string;
  readonly fromNumber: bigint;
  readonly toNumber: bigint;
  readonly currentNumber?: bigint | undefined;
  readonly resolutionNumber?: string | undefined;
  readonly resolutionDate?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly warningThreshold?: number | undefined;
  readonly status?: FiscalSequenceStatus | undefined;
}

export class FiscalSequenceRange {
  readonly id: string;
  readonly tenantId: string;
  readonly jurisdiction: string;
  readonly documentType: FiscalSequenceDocumentType;
  readonly prefix: string;
  readonly fromNumber: bigint;
  readonly toNumber: bigint;
  readonly currentNumber: bigint;
  readonly resolutionNumber?: string | undefined;
  readonly resolutionDate?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly warningThreshold: number;
  readonly status: FiscalSequenceStatus;

  private constructor(
    props: FiscalSequenceRangeProps,
    currentNumber: bigint,
    status: FiscalSequenceStatus,
    warningThreshold: number,
  ) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.jurisdiction = props.jurisdiction;
    this.documentType = props.documentType;
    this.prefix = props.prefix;
    this.fromNumber = props.fromNumber;
    this.toNumber = props.toNumber;
    this.currentNumber = currentNumber;
    this.resolutionNumber = props.resolutionNumber;
    this.resolutionDate = props.resolutionDate;
    this.expiresAt = props.expiresAt;
    this.warningThreshold = warningThreshold;
    this.status = status;
  }

  static create(
    props: FiscalSequenceRangeProps,
    now: Date = new Date(),
  ): Result<FiscalSequenceRange, FiscalSequenceError> {
    if (props.fromNumber <= 0n || props.toNumber < props.fromNumber) {
      return err({
        kind: 'InvalidRangeBounds',
        fromNumber: props.fromNumber,
        toNumber: props.toNumber,
      });
    }

    if (
      props.resolutionDate &&
      props.expiresAt &&
      props.resolutionDate.getTime() > props.expiresAt.getTime()
    ) {
      return err({ kind: 'ResolutionDateAfterExpiration' });
    }

    const currentNumber = props.currentNumber ?? props.fromNumber - 1n;
    if (currentNumber < props.fromNumber - 1n || currentNumber > props.toNumber) {
      return err({
        kind: 'CurrentNumberOutOfRange',
        currentNumber,
        fromNumber: props.fromNumber,
        toNumber: props.toNumber,
      });
    }

    let status: FiscalSequenceStatus = props.status ?? 'ACTIVE';

    if (status !== 'INACTIVE') {
      if (props.expiresAt && now.getTime() > props.expiresAt.getTime()) {
        status = 'EXPIRED';
      } else if (currentNumber >= props.toNumber) {
        status = 'EXHAUSTED';
      }
    }

    const warningThreshold = props.warningThreshold ?? 100;

    return ok(new FiscalSequenceRange(props, currentNumber, status, warningThreshold));
  }

  nextSequence(now: Date = new Date()): Result<
    {
      range: FiscalSequenceRange;
      assignedNumber: bigint;
      formattedNumber: string;
    },
    FiscalSequenceError
  > {
    if (this.status === 'INACTIVE') {
      return err({ kind: 'FiscalSequenceInactive' });
    }

    if (this.expiresAt && now.getTime() > this.expiresAt.getTime()) {
      return err({
        kind: 'FiscalSequenceExpired',
        expiresAt: this.expiresAt,
      });
    }

    if (this.currentNumber >= this.toNumber) {
      return err({
        kind: 'FiscalSequenceExhausted',
        currentNumber: this.currentNumber,
        toNumber: this.toNumber,
      });
    }

    const assignedNumber = this.currentNumber + 1n;
    const isExhausted = assignedNumber >= this.toNumber;
    const nextStatus: FiscalSequenceStatus = isExhausted ? 'EXHAUSTED' : 'ACTIVE';

    const formattedNumber =
      this.prefix.length > 0
        ? `${this.prefix}${assignedNumber.toString().padStart(8, '0')}`
        : assignedNumber.toString().padStart(8, '0');

    const updatedRange = new FiscalSequenceRange(
      this,
      assignedNumber,
      nextStatus,
      this.warningThreshold,
    );

    return ok({
      range: updatedRange,
      assignedNumber,
      formattedNumber,
    });
  }

  get remainingNumbers(): bigint {
    return this.toNumber - this.currentNumber;
  }

  get isNearExhaustion(): boolean {
    return this.status === 'ACTIVE' && this.remainingNumbers <= BigInt(this.warningThreshold);
  }

  isNearExpiration(now: Date = new Date(), daysThreshold = 15): boolean {
    if (!this.expiresAt || this.status !== 'ACTIVE') {
      return false;
    }
    const diffMs = this.expiresAt.getTime() - now.getTime();
    if (diffMs <= 0) {
      return true;
    }
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= daysThreshold;
  }

  deactivate(): FiscalSequenceRange {
    return new FiscalSequenceRange(this, this.currentNumber, 'INACTIVE', this.warningThreshold);
  }
}
