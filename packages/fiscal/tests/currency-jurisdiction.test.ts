import { describe, expect, it } from 'vitest';
import {
  computeConvertedMinor,
  computeFxDifferenceMinor,
  resolveFiscalCurrency,
  resolveOperatingCurrencies,
} from '../src/domain/model/currency-jurisdiction';

describe('CurrencyJurisdiction', () => {
  it('resolves fiscal and operating currencies per country', () => {
    expect(resolveFiscalCurrency('VE')).toBe('VES');
    expect(resolveFiscalCurrency('US')).toBe('USD');

    expect(resolveOperatingCurrencies('VE')).toEqual(['VES', 'USD', 'EUR']);
    expect(resolveOperatingCurrencies('US')).toEqual(['USD']);
  });

  it('converts minor units deterministically using exchange rate', () => {
    expect(computeConvertedMinor(10000n, 50.25)).toBe(502500n);
    expect(computeConvertedMinor(500000n, 1 / 50)).toBe(10000n);
  });

  it('computes realized FX difference when credit invoice settles at a higher rate', () => {
    expect(computeFxDifferenceMinor(10000n, 50, 55)).toBe(50000n);
    expect(computeFxDifferenceMinor(10000n, 50, 50)).toBe(0n);
  });
});
