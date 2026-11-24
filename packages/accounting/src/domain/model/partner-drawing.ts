import { type Currency, type Result, type Money, ok, err } from '@corebiz/shared-kernel';

export type PartnerDrawingType = 'CASH' | 'STOCK';
export type PartnerDrawingStatus = 'COMPLETED' | 'CANCELLED';

export interface PartnerDrawingError {
  readonly kind:
    | 'InvalidDrawingAmount'
    | 'IdenticalAccounts'
    | 'MissingPartnerName'
    | 'MissingOperatorUserId'
    | 'MissingProductDetails'
    | 'InvalidQuantity'
    | 'InvalidUnitCost';
}

export interface CreatePartnerDrawingProps {
  readonly id: string;
  readonly tenantId: string;
  readonly drawingNumber: bigint;
  readonly drawingType: PartnerDrawingType;
  readonly date: Date;
  readonly partnerId: string;
  readonly partnerName: string;
  readonly drawingAccountId: string;
  readonly creditAccountId: string;
  readonly currency: Currency;
  readonly amount: Money;
  readonly productId?: string | undefined;
  readonly quantity?: number | undefined;
  readonly unitCost?: Money | undefined;
  readonly operatorUserId: string;
  readonly notes: string;
  readonly journalEntryId: string;
  readonly status?: PartnerDrawingStatus | undefined;
  readonly createdAt?: Date | undefined;
}

export class PartnerDrawing {
  readonly id: string;
  readonly tenantId: string;
  readonly drawingNumber: bigint;
  readonly drawingType: PartnerDrawingType;
  readonly date: Date;
  readonly partnerId: string;
  readonly partnerName: string;
  readonly drawingAccountId: string;
  readonly creditAccountId: string;
  readonly currency: Currency;
  readonly amount: Money;
  readonly productId?: string | undefined;
  readonly quantity?: number | undefined;
  readonly unitCost?: Money | undefined;
  readonly operatorUserId: string;
  readonly notes: string;
  readonly journalEntryId: string;
  readonly status: PartnerDrawingStatus;
  readonly createdAt: Date;

  private constructor(props: CreatePartnerDrawingProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.drawingNumber = props.drawingNumber;
    this.drawingType = props.drawingType;
    this.date = props.date;
    this.partnerId = props.partnerId.trim();
    this.partnerName = props.partnerName.trim();
    this.drawingAccountId = props.drawingAccountId;
    this.creditAccountId = props.creditAccountId;
    this.currency = props.currency;
    this.amount = props.amount;
    this.productId = props.productId?.trim();
    this.quantity = props.quantity;
    this.unitCost = props.unitCost;
    this.operatorUserId = props.operatorUserId.trim();
    this.notes = props.notes.trim();
    this.journalEntryId = props.journalEntryId;
    this.status = props.status ?? 'COMPLETED';
    this.createdAt = props.createdAt ?? new Date();
  }

  static create(props: CreatePartnerDrawingProps): Result<PartnerDrawing, PartnerDrawingError> {
    if (props.amount.minorUnits <= 0n) {
      return err({ kind: 'InvalidDrawingAmount' });
    }

    if (props.drawingAccountId === props.creditAccountId) {
      return err({ kind: 'IdenticalAccounts' });
    }

    if (!props.partnerName || props.partnerName.trim().length === 0) {
      return err({ kind: 'MissingPartnerName' });
    }

    if (!props.operatorUserId || props.operatorUserId.trim().length === 0) {
      return err({ kind: 'MissingOperatorUserId' });
    }

    if (props.drawingType === 'STOCK') {
      if (!props.productId || props.productId.trim().length === 0) {
        return err({ kind: 'MissingProductDetails' });
      }
      if (props.quantity === undefined || props.quantity <= 0) {
        return err({ kind: 'InvalidQuantity' });
      }
      if (!props.unitCost || props.unitCost.minorUnits <= 0n) {
        return err({ kind: 'InvalidUnitCost' });
      }
    }

    return ok(new PartnerDrawing(props));
  }
}
