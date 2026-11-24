import { type Currency, Money, ok, err, type Result } from '@corebiz/shared-kernel';
import type { MonetaryPosition } from './monetary-position';

export interface ForexRevaluationError {
  readonly kind: 'EmptyPositions' | 'FunctionalCurrencyMismatch';
}

export interface ForexRevaluationProps {
  readonly id: string;
  readonly tenantId: string;
  readonly revaluationDate: Date;
  readonly functionalCurrency: Currency;
  readonly positions: readonly MonetaryPosition[];
  readonly gainAccountId: string;
  readonly lossAccountId: string;
  readonly description?: string | undefined;
}

export class ForexRevaluation {
  readonly id: string;
  readonly tenantId: string;
  readonly revaluationDate: Date;
  readonly functionalCurrency: Currency;
  readonly positions: readonly MonetaryPosition[];
  readonly gainAccountId: string;
  readonly lossAccountId: string;
  readonly description?: string | undefined;

  private constructor(props: ForexRevaluationProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.revaluationDate = props.revaluationDate;
    this.functionalCurrency = props.functionalCurrency;
    this.positions = props.positions;
    this.gainAccountId = props.gainAccountId;
    this.lossAccountId = props.lossAccountId;
    this.description = props.description;
  }

  static create(props: ForexRevaluationProps): Result<ForexRevaluation, ForexRevaluationError> {
    if (props.positions.length === 0) {
      return err({ kind: 'EmptyPositions' });
    }

    for (const pos of props.positions) {
      if (pos.functionalCurrency !== props.functionalCurrency) {
        return err({ kind: 'FunctionalCurrencyMismatch' });
      }
    }

    return ok(new ForexRevaluation(props));
  }

  calculateTotalGains(): Money {
    let total = 0n;
    for (const pos of this.positions) {
      const adj = pos.calculateForexAdjustment();
      if (adj.isGain) {
        total += adj.adjustmentAmount.minorUnits;
      }
    }
    return Money.fromMinor(total, this.functionalCurrency);
  }

  calculateTotalLosses(): Money {
    let total = 0n;
    for (const pos of this.positions) {
      const adj = pos.calculateForexAdjustment();
      if (!adj.isGain) {
        total += adj.adjustmentAmount.minorUnits;
      }
    }
    return Money.fromMinor(total, this.functionalCurrency);
  }

  calculateNetDelta(): Money {
    const gains = this.calculateTotalGains().minorUnits;
    const losses = this.calculateTotalLosses().minorUnits;
    return Money.fromMinor(gains - losses, this.functionalCurrency);
  }
}
