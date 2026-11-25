import type { Currency } from '@corebiz/shared-kernel';

export type FiscalJurisdictionCode = 'VE' | 'US' | 'CO';

export function resolveFiscalCurrency(country: string): Currency {
  if (country === 'VE') return 'VES';
  return 'USD';
}

export function resolveOperatingCurrencies(country: string): readonly Currency[] {
  if (country === 'VE') return ['VES', 'USD', 'EUR'];
  return ['USD'];
}

export function computeConvertedMinor(amountMinor: bigint, rate: number): bigint {
  if (!Number.isFinite(rate) || rate <= 0) return amountMinor;
  const scaledRate = BigInt(Math.round(rate * 10000));
  return (amountMinor * scaledRate) / 10000n;
}

export function computeFxDifferenceMinor(
  originalMinor: bigint,
  originalRate: number,
  settlementRate: number,
): bigint {
  const originalFiscal = computeConvertedMinor(originalMinor, originalRate);
  const settledFiscal = computeConvertedMinor(originalMinor, settlementRate);
  return settledFiscal - originalFiscal;
}
