import {
  type Money,
  type ExchangeRate,
  type Currency,
  ok,
  err,
  type Result,
} from '@corebiz/shared-kernel';

export type MonetaryPositionType = 'ASSET' | 'LIABILITY';

export interface MonetaryPositionError {
  readonly kind: 'CurrencyMismatch' | 'ZeroForeignAmount';
}

export interface MonetaryPositionProps {
  readonly accountId: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly positionType: MonetaryPositionType;
  readonly foreignAmount: Money;
  readonly historicalRate: ExchangeRate;
  readonly closingRate: ExchangeRate;
}

export class MonetaryPosition {
  readonly accountId: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly positionType: MonetaryPositionType;
  readonly foreignAmount: Money;
  readonly historicalRate: ExchangeRate;
  readonly closingRate: ExchangeRate;

  private constructor(props: MonetaryPositionProps) {
    this.accountId = props.accountId;
    this.accountCode = props.accountCode;
    this.accountName = props.accountName;
    this.positionType = props.positionType;
    this.foreignAmount = props.foreignAmount;
    this.historicalRate = props.historicalRate;
    this.closingRate = props.closingRate;
  }

  static create(props: MonetaryPositionProps): Result<MonetaryPosition, MonetaryPositionError> {
    if (props.foreignAmount.isZero) {
      return err({ kind: 'ZeroForeignAmount' });
    }

    if (
      props.historicalRate.from !== props.foreignAmount.currency ||
      props.closingRate.from !== props.foreignAmount.currency ||
      props.historicalRate.to !== props.closingRate.to
    ) {
      return err({ kind: 'CurrencyMismatch' });
    }

    return ok(new MonetaryPosition(props));
  }

  get foreignCurrency(): Currency {
    return this.foreignAmount.currency;
  }

  get functionalCurrency(): Currency {
    return this.closingRate.to;
  }

  calculateHistoricalBookValue(): Money {
    const converted = this.historicalRate.convert(this.foreignAmount);
    return converted.ok ? converted.value : this.foreignAmount;
  }

  calculateRevaluedMarketValue(): Money {
    const converted = this.closingRate.convert(this.foreignAmount);
    return converted.ok ? converted.value : this.foreignAmount;
  }

  calculateUnrealizedDelta(): Money {
    const revalued = this.calculateRevaluedMarketValue();
    const historical = this.calculateHistoricalBookValue();
    const diff = revalued.subtract(historical);
    return diff.ok ? diff.value : revalued;
  }

  calculateForexAdjustment(): { readonly isGain: boolean; readonly adjustmentAmount: Money } {
    const delta = this.calculateUnrealizedDelta();

    if (this.positionType === 'ASSET') {
      if (delta.isPositive) {
        return { isGain: true, adjustmentAmount: delta };
      }
      return { isGain: false, adjustmentAmount: delta.negate() };
    }

    if (delta.isPositive) {
      return { isGain: false, adjustmentAmount: delta };
    }
    return { isGain: true, adjustmentAmount: delta.negate() };
  }
}
