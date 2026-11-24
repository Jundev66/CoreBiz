import { type Currency, type Result, type Money, ok, err } from '@corebiz/shared-kernel';

export type TreasurySwapStatus = 'COMPLETED' | 'CANCELLED';

export interface TreasurySwapError {
  readonly kind:
    | 'InvalidSourceAmount'
    | 'InvalidTargetAmount'
    | 'InvalidFeeAmount'
    | 'IdenticalAccounts'
    | 'MissingCounterpartyReference'
    | 'MissingOperatorUserId';
}

export interface CreateTreasurySwapProps {
  readonly id: string;
  readonly tenantId: string;
  readonly swapNumber: bigint;
  readonly date: Date;
  readonly sourceAccountId: string;
  readonly sourceCurrency: Currency;
  readonly sourceAmount: Money;
  readonly targetAccountId: string;
  readonly targetCurrency: Currency;
  readonly targetAmount: Money;
  readonly feeAccountId: string;
  readonly feeAmount: Money;
  readonly exchangeRateScaled: bigint;
  readonly counterpartyReference: string;
  readonly operatorUserId: string;
  readonly description: string;
  readonly journalEntryId: string;
  readonly status?: TreasurySwapStatus;
  readonly createdAt?: Date;
}

export class TreasurySwap {
  readonly id: string;
  readonly tenantId: string;
  readonly swapNumber: bigint;
  readonly date: Date;
  readonly sourceAccountId: string;
  readonly sourceCurrency: Currency;
  readonly sourceAmount: Money;
  readonly targetAccountId: string;
  readonly targetCurrency: Currency;
  readonly targetAmount: Money;
  readonly feeAccountId: string;
  readonly feeAmount: Money;
  readonly exchangeRateScaled: bigint;
  readonly counterpartyReference: string;
  readonly operatorUserId: string;
  readonly description: string;
  readonly journalEntryId: string;
  readonly status: TreasurySwapStatus;
  readonly createdAt: Date;

  private constructor(props: CreateTreasurySwapProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.swapNumber = props.swapNumber;
    this.date = props.date;
    this.sourceAccountId = props.sourceAccountId;
    this.sourceCurrency = props.sourceCurrency;
    this.sourceAmount = props.sourceAmount;
    this.targetAccountId = props.targetAccountId;
    this.targetCurrency = props.targetCurrency;
    this.targetAmount = props.targetAmount;
    this.feeAccountId = props.feeAccountId;
    this.feeAmount = props.feeAmount;
    this.exchangeRateScaled = props.exchangeRateScaled;
    this.counterpartyReference = props.counterpartyReference.trim();
    this.operatorUserId = props.operatorUserId.trim();
    this.description = props.description.trim();
    this.journalEntryId = props.journalEntryId;
    this.status = props.status ?? 'COMPLETED';
    this.createdAt = props.createdAt ?? new Date();
  }

  static create(props: CreateTreasurySwapProps): Result<TreasurySwap, TreasurySwapError> {
    if (props.sourceAmount.minorUnits <= 0n) {
      return err({ kind: 'InvalidSourceAmount' });
    }

    if (props.targetAmount.minorUnits <= 0n) {
      return err({ kind: 'InvalidTargetAmount' });
    }

    if (props.feeAmount.minorUnits < 0n) {
      return err({ kind: 'InvalidFeeAmount' });
    }

    if (props.sourceAccountId === props.targetAccountId) {
      return err({ kind: 'IdenticalAccounts' });
    }

    if (!props.counterpartyReference || props.counterpartyReference.trim().length === 0) {
      return err({ kind: 'MissingCounterpartyReference' });
    }

    if (!props.operatorUserId || props.operatorUserId.trim().length === 0) {
      return err({ kind: 'MissingOperatorUserId' });
    }

    return ok(new TreasurySwap(props));
  }
}
