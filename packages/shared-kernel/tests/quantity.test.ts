import { describe, it, expect } from 'vitest';
import { Quantity } from '../src/value-objects/quantity';
import { unwrap } from '../src/result';

const q = (v: string | number) => unwrap(Quantity.of(v));

describe('Quantity construction', () => {
  it('accepts up to three decimal places', () => {
    expect(q('0,250').toString()).toBe('0.250');
    expect(q('1.500').toCompactString()).toBe('1.5');
    expect(q(3).toCompactString()).toBe('3');
  });

  it('rejects excess decimals instead of silent rounding', () => {
    const result = Quantity.of('1.2345');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('TooManyDecimals');
      if (result.error.kind === 'TooManyDecimals') expect(result.error.max).toBe(3);
    }
  });

  it('rejects invalid inputs', () => {
    for (const bad of ['abc', '', '1..2', Number.NaN]) {
      expect(Quantity.of(bad as string).ok).toBe(false);
    }
  });

  it('positive() enforces strictly positive quantity', () => {
    expect(Quantity.positive('0').ok).toBe(false);
    expect(Quantity.positive('-1').ok).toBe(false);
    expect(Quantity.positive('0.001').ok).toBe(true);
  });
});

describe('Quantity exact arithmetic', () => {
  it('accumulates without floating point error', () => {
    let acc = Quantity.zero();
    for (let i = 0; i < 1000; i += 1) acc = acc.add(q('0.001'));
    expect(acc.toString()).toBe('1.000');
  });

  it('subtracts and allows negative values', () => {
    expect(q('2.5').subtract(q('4')).toString()).toBe('-1.500');
    expect(q('2.5').subtract(q('4')).isNegative).toBe(true);
  });

  it('compares correctly for stock checks', () => {
    const available = q('10');
    const requested = q('50');
    expect(requested.isGreaterThan(available)).toBe(true);
    expect(available.compare(requested)).toBe(-1);
    expect(available.compare(q('10'))).toBe(0);
  });

  it('sums array of quantities', () => {
    expect(Quantity.sum([q('1.5'), q('2.25'), q('0.25')]).toString()).toBe('4.000');
  });
});
