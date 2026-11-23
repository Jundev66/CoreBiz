import { type AccountCode } from './account-code';
import { resolveNormalBalanceSide, type AccountCategory, type BalanceSide } from './account-type';

export interface AccountProps {
  readonly id: string;
  readonly tenantId: string;
  readonly code: AccountCode;
  readonly name: string;
  readonly category: AccountCategory;
  readonly parentId?: string | undefined;
  readonly isReconcilable: boolean;
  readonly isActive: boolean;
}

export class Account {
  readonly id: string;
  readonly tenantId: string;
  readonly code: AccountCode;
  readonly name: string;
  readonly category: AccountCategory;
  readonly normalSide: BalanceSide;
  readonly parentId?: string | undefined;
  readonly isReconcilable: boolean;
  readonly isActive: boolean;

  constructor(props: AccountProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.code = props.code;
    this.name = props.name;
    this.category = props.category;
    this.normalSide = resolveNormalBalanceSide(props.category);
    this.parentId = props.parentId;
    this.isReconcilable = props.isReconcilable;
    this.isActive = props.isActive;
  }
}
