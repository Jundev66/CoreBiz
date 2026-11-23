import { describe, expect, it } from 'vitest';
import { TaxRate } from '../src/domain/value-objects/tax-rate';
import { TaxRateMother } from './mothers/TaxRateMother';

describe('TaxRate Value Object', () => {
  it('creates standard 16% rate via Mother', () => {
    const rate = TaxRateMother.standard16();
    expect(rate.percentage).toBe(16);
    expect(rate.basisPoints).toBe(1600);
    expect(rate.calculateTaxAmount(10000n)).toBe(1600n);
  });

  it('creates zero rate via Mother', () => {
    const rate = TaxRateMother.zero();
    expect(rate.percentage).toBe(0);
    expect(rate.calculateTaxAmount(50000n)).toBe(0n);
  });

  it('calculates tax with half-up rounding', () => {
    const rate = TaxRateMother.standard16();
    expect(rate.calculateTaxAmount(1050n)).toBe(168n);
  });

  it('rejects rate over 100', () => {
    const result = TaxRate.fromPercentage(105);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('TaxRateOutOfRange');
    }
  });

  it('rejects negative rate', () => {
    const result = TaxRate.fromPercentage(-5);
    expect(result.ok).toBe(false);
  });
});
