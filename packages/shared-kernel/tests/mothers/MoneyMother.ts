import { Money, type Currency } from '../../src/value-objects/money';

export class MoneyMother {
  static create(amount: string | number, currency: Currency = 'USD'): Money {
    const result = Money.of(amount, currency);
    if (!result.ok) {
      throw new Error(`Failed to create Money: ${JSON.stringify(result.error)}`);
    }
    return result.value;
  }

  static fromMinor(minorUnits: bigint, currency: Currency = 'USD'): Money {
    return Money.fromMinor(minorUnits, currency);
  }

  static usd(amount: number | string = 100): Money {
    return MoneyMother.create(amount, 'USD');
  }

  static ves(amount: number | string = 100): Money {
    return MoneyMother.create(amount, 'VES');
  }

  static zero(currency: Currency = 'USD'): Money {
    return Money.zero(currency);
  }
}
