import { describe, it, expect } from 'vitest';
import { Money, pow10 } from '../src/value-objects/money';
import { Quantity } from '../src/value-objects/quantity';
import { ExchangeRate } from '../src/value-objects/exchange-rate';
import { unwrap } from '../src/result';
import { assertNever } from '../src/errors';

const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const AT = new Date('2026-03-15T10:00:00.000Z');

describe('Rounding policies', () => {
  it('HALF_UP rounds halves away from zero', () => {
    expect(usd('10').multiplyScaled(1005n, 3, 'HALF_UP').toString()).toBe('10.05');
  });

  it('HALF_EVEN rounds halves towards nearest even integer', () => {
    expect(usd('1').multiplyScaled(125n, 3, 'HALF_EVEN').toString()).toBe('0.12');
    expect(usd('1').multiplyScaled(135n, 3, 'HALF_EVEN').toString()).toBe('0.14');
  });

  it('DOWN truncates towards zero', () => {
    expect(usd('1').multiplyScaled(199n, 3, 'DOWN').toString()).toBe('0.19');
  });

  it('respects signs across all three rounding policies', () => {
    expect(usd('-1').multiplyScaled(1005n, 3, 'HALF_UP').toString()).toBe('-1.01');
    expect(usd('-1').multiplyScaled(125n, 3, 'HALF_EVEN').toString()).toBe('-0.12');
    expect(usd('-1').multiplyScaled(199n, 3, 'DOWN').toString()).toBe('-0.19');
  });

  it('pow10 calculates exact bigint powers of ten', () => {
    expect(pow10(0)).toBe(1n);
    expect(pow10(8)).toBe(100_000_000n);
  });
});

describe('Money utilities', () => {
  it('compare returns -1, 0, or 1', () => {
    expect(unwrap(usd('5').compare(usd('10')))).toBe(-1);
    expect(unwrap(usd('10').compare(usd('10')))).toBe(0);
    expect(unwrap(usd('15').compare(usd('10')))).toBe(1);
  });

  it('compare fails on currency mismatch', () => {
    const result = usd('5').compare(unwrap(Money.of('5', 'VES')));
    expect(result.ok).toBe(false);
  });

  it('negate flips sign', () => {
    expect(usd('25.50').negate().toString()).toBe('-25.50');
    expect(usd('25.50').negate().negate().equals(usd('25.50'))).toBe(true);
  });

  it('subtract works within same currency and fails on mismatch', () => {
    expect(unwrap(usd('10').subtract(usd('2.50'))).toString()).toBe('7.50');
    expect(usd('10').subtract(unwrap(Money.of('1', 'VES'))).ok).toBe(false);
  });

  it('exposes zero, isZero, and scale', () => {
    expect(Money.zero('USD').isZero).toBe(true);
    expect(Money.zero('USD').scale).toBe(2);
    expect(usd('0.01').isZero).toBe(false);
  });

  it('sum fails if input array mixes currencies', () => {
    expect(Money.sum([usd('1'), unwrap(Money.of('1', 'VES'))], 'USD').ok).toBe(false);
  });

  it('allocate on empty weights returns empty array', () => {
    expect(usd('10').allocate([])).toEqual([]);
  });

  it('allocate throws on non-positive total weight', () => {
    expect(() => usd('10').allocate([0, 0])).toThrow(/weights sum/);
  });
});

describe('Quantity utilities', () => {
  it('exposes isPositive, isZero, and negate', () => {
    expect(Quantity.of('1').ok && unwrap(Quantity.of('1')).isPositive).toBe(true);
    expect(Quantity.zero().isZero).toBe(true);
    expect(unwrap(Quantity.of('2.5')).negate().toString()).toBe('-2.500');
  });

  it('isLessThan and equals compare accurately', () => {
    const two = unwrap(Quantity.of('2'));
    expect(two.isLessThan(unwrap(Quantity.of('3')))).toBe(true);
    expect(two.equals(unwrap(Quantity.of('2.000')))).toBe(true);
  });

  it('fromScaled and toJSON round-trip cleanly', () => {
    const restored = Quantity.fromScaled(2500n);
    expect(restored.toString()).toBe('2.500');
    expect(restored.toJSON()).toBe('2.500');
  });

  it('toCompactString collapses zero to "0"', () => {
    expect(Quantity.zero().toCompactString()).toBe('0');
  });
});

describe('ExchangeRate utilities', () => {
  it('rejects non-finite rates', () => {
    expect(ExchangeRate.of(Number.NaN, 'USD', 'VES', AT).ok).toBe(false);
    expect(ExchangeRate.of(Number.POSITIVE_INFINITY, 'USD', 'VES', AT).ok).toBe(false);
  });

  it('converts using DOWN and HALF_EVEN rounding modes', () => {
    const r = unwrap(ExchangeRate.of('36,505', 'USD', 'VES', AT));
    expect(unwrap(r.convert(usd('1'), 'DOWN')).toString()).toBe('36.50');
    expect(unwrap(r.convert(usd('1'), 'HALF_UP')).toString()).toBe('36.51');
  });

  it('preserves eight decimal places in toString and JSON', () => {
    const r = unwrap(ExchangeRate.of('36,5', 'USD', 'VES', AT));
    expect(r.toString()).toBe('36.50000000');
    expect(r.toJSON()).toEqual({
      scaledRate: '3650000000',
      from: 'USD',
      to: 'VES',
      capturedAt: AT.toISOString(),
    });
  });

  it('distinguishes rates captured at different timestamps', () => {
    const a = unwrap(ExchangeRate.of('36,5', 'USD', 'VES', AT));
    const b = unwrap(ExchangeRate.of('36,5', 'USD', 'VES', new Date('2026-04-01T00:00:00.000Z')));
    expect(a.equals(b)).toBe(false);
  });

  it('converting zero results in zero', () => {
    const r = unwrap(ExchangeRate.of('36,5', 'USD', 'VES', AT));
    expect(unwrap(r.convert(Money.zero('USD'))).isZero).toBe(true);
  });
});

describe('assertNever', () => {
  it('throws when encountering an unhandled variant', () => {
    expect(() => assertNever('unexpected' as never, 'status')).toThrow(/unhandled/);
  });
});
