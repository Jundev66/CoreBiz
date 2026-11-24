import { type Money, ok, err, type Result } from '@corebiz/shared-kernel';

export type DisbursementCategory =
  | 'LOGISTICS'
  | 'UTILITIES_RENT'
  | 'SUPPLIES'
  | 'MAINTENANCE'
  | 'CUSTOMS_DUTIES'
  | 'SERVICES'
  | 'GENERAL';

export interface DisbursementError {
  readonly kind:
    | 'InvalidDisbursementAmount'
    | 'EmptyDisbursementBeneficiary'
    | 'IdenticalSourceAndExpenseAccount';
}

export interface DisbursementProps {
  readonly id: string;
  readonly tenantId: string;
  readonly disbursementNumber: bigint;
  readonly date: Date;
  readonly category: DisbursementCategory;
  readonly beneficiary: string;
  readonly taxId?: string | undefined;
  readonly receiptNumber?: string | undefined;
  readonly sourceAccountId: string;
  readonly expenseAccountId: string;
  readonly amount: Money;
  readonly notes: string;
  readonly journalEntryId: string;
  readonly createdAt: Date;
}

export class Disbursement {
  readonly id: string;
  readonly tenantId: string;
  readonly disbursementNumber: bigint;
  readonly date: Date;
  readonly category: DisbursementCategory;
  readonly beneficiary: string;
  readonly taxId?: string | undefined;
  readonly receiptNumber?: string | undefined;
  readonly sourceAccountId: string;
  readonly expenseAccountId: string;
  readonly amount: Money;
  readonly notes: string;
  readonly journalEntryId: string;
  readonly createdAt: Date;

  private constructor(props: DisbursementProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.disbursementNumber = props.disbursementNumber;
    this.date = props.date;
    this.category = props.category;
    this.beneficiary = props.beneficiary;
    this.taxId = props.taxId;
    this.receiptNumber = props.receiptNumber;
    this.sourceAccountId = props.sourceAccountId;
    this.expenseAccountId = props.expenseAccountId;
    this.amount = props.amount;
    this.notes = props.notes;
    this.journalEntryId = props.journalEntryId;
    this.createdAt = props.createdAt;
  }

  static create(props: DisbursementProps): Result<Disbursement, DisbursementError> {
    if (!props.amount.isPositive) {
      return err({ kind: 'InvalidDisbursementAmount' });
    }

    if (!props.beneficiary || props.beneficiary.trim() === '') {
      return err({ kind: 'EmptyDisbursementBeneficiary' });
    }

    if (props.sourceAccountId === props.expenseAccountId) {
      return err({ kind: 'IdenticalSourceAndExpenseAccount' });
    }

    return ok(new Disbursement(props));
  }
}
