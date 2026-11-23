import { TaxRate } from '../../src/fiscal/value-objects/tax-rate';

export class TaxRateMother {
  static standard16(): TaxRate {
    const result = TaxRate.fromPercentage(16);
    if (!result.ok) {
      throw new Error('Failed to create 16% TaxRate');
    }
    return result.value;
  }

  static reduced8(): TaxRate {
    const result = TaxRate.fromPercentage(8);
    if (!result.ok) {
      throw new Error('Failed to create 8% TaxRate');
    }
    return result.value;
  }

  static zero(): TaxRate {
    return TaxRate.zero();
  }
}
