import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Money } from '../src/value-objects/money';
import { unwrap } from '../src/result';

const usd = (v: string | number) => unwrap(Money.of(v, 'USD'));

describe('Money construction', () => {
  it('parses comma as decimal separator', () => {
    expect(usd('25,50').minorUnits).toBe(2550n);
    expect(usd('25.50').minorUnits).toBe(2550n);
  });

  it('rejects thousand separators', () => {
    const result = Money.of('1.234,56', 'USD');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidAmount');
  });

  it('rounds once on construction without truncation', () => {
    expect(usd('1.005').toString()).toBe('1.01');
    expect(usd('1.004').toString()).toBe('1.00');
  });

  it('rejects non numeric and non finite inputs', () => {
    for (const bad of ['abc', '', '1.2.3', '--5', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Money.of(bad as string, 'USD').ok).toBe(false);
    }
  });

  it('accepts negative amounts', () => {
    expect(usd('-10,25').minorUnits).toBe(-1025n);
    expect(usd('-10,25').isNegative).toBe(true);
  });
});

describe('Money exact arithmetic', () => {
  it('does not suffer floating point inaccuracies', () => {
    const total = unwrap(usd('0.10').add(usd('0.20')));
    expect(total.toString()).toBe('0.30');
    expect(total.equals(usd('0.30'))).toBe(true);
  });

  it('preserves precision over thousands of additions', () => {
    let acc = Money.zero('USD');
    for (let i = 0; i < 10_000; i += 1) acc = unwrap(acc.add(usd('0.01')));
    expect(acc.toString()).toBe('100.00');
  });

  it('prevents adding distinct currencies', () => {
    const mixed = usd('10').add(unwrap(Money.of('10', 'VES')));
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.error.kind).toBe('CurrencyMismatch');
  });

  it('calculates percentage in basis points', () => {
    expect(usd('100').percentage(1600).toString()).toBe('16.00');
    expect(usd('33.33').percentage(1600).toString()).toBe('5.33');
  });

  it('multiplies scaled quantity rounding once', () => {
    expect(usd('25.50').multiplyScaled(2500n, 3).toString()).toBe('63.75');
  });
});

describe('Money allocate', () => {
  it('splits amount across parts without losing or creating minor units', () => {
    const parts = usd('100').allocate([1, 1, 1]);
    expect(parts.map((p) => p.toString())).toEqual(['33.34', '33.33', '33.33']);
    const total = unwrap(Money.sum(parts, 'USD'));
    expect(total.equals(usd('100'))).toBe(true);
  });

  it('respects uneven weights and maintains balance', () => {
    const parts = usd('10').allocate([3, 7]);
    expect(unwrap(Money.sum(parts, 'USD')).toString()).toBe('10.00');
  });

  it('allocates negative amounts correctly', () => {
    const parts = usd('-100').allocate([1, 1, 1]);
    expect(unwrap(Money.sum(parts, 'USD')).toString()).toBe('-100.00');
  });

  it('property: allocation always preserves total sum', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 12 }),
        (cents, weights) => {
          const amount = Money.fromMinor(BigInt(cents), 'USD');
          const parts = amount.allocate(weights);
          return unwrap(Money.sum(parts, 'USD')).equals(amount);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('Money serialization', () => {
  it('survives round-trip via minor units', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), (minor) => {
        const original = Money.fromMinor(minor, 'USD');
        const restored = unwrap(Money.of(original.toString(), 'USD'));
        return restored.equals(original);
      }),
      { numRuns: 500 },
    );
  });

  it('serializes to JSON without precision loss', () => {
    expect(usd('1234.56').toJSON()).toEqual({ minorUnits: '123456', currency: 'USD' });
  });
});
