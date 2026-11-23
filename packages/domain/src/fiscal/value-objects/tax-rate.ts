import { ok, err, type Result } from '../../shared/result';

export interface TaxRateError {
  readonly kind: 'TaxRateOutOfRange' | 'InvalidTaxRatePrecision';
  readonly value: number;
}

export class TaxRate {
  private constructor(
    readonly percentage: number,
    readonly basisPoints: number,
  ) {}

  static fromPercentage(percentage: number): Result<TaxRate, TaxRateError> {
    if (percentage < 0 || percentage > 100) {
      return err({ kind: 'TaxRateOutOfRange', value: percentage });
    }

    const roundedBasisPoints = Math.round(percentage * 100);
    if (Math.abs(roundedBasisPoints / 100 - percentage) > 0.001) {
      return err({ kind: 'InvalidTaxRatePrecision', value: percentage });
    }

    return ok(new TaxRate(percentage, roundedBasisPoints));
  }

  static fromBasisPoints(basisPoints: number): Result<TaxRate, TaxRateError> {
    if (basisPoints < 0 || basisPoints > 10000) {
      return err({ kind: 'TaxRateOutOfRange', value: basisPoints / 100 });
    }

    return ok(new TaxRate(basisPoints / 100, Math.round(basisPoints)));
  }

  static zero(): TaxRate {
    return new TaxRate(0, 0);
  }

  calculateTaxAmount(baseMinorUnits: bigint): bigint {
    return (baseMinorUnits * BigInt(this.basisPoints) + 5000n) / 10000n;
  }
}
