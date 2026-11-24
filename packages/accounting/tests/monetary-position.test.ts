import { describe, it, expect } from 'vitest';
import { MonetaryPosition } from '../src/domain/model/monetary-position';
import { Money, ExchangeRate } from '@corebiz/shared-kernel';

describe('MonetaryPosition', () => {
  it('calculates forex gain for an asset when exchange rate increases', () => {
    const historicalRate = ExchangeRate.of('36.00', 'USD', 'VES', new Date('2026-11-01'));
    const closingRate = ExchangeRate.of('38.50', 'USD', 'VES', new Date('2026-11-30'));
    const foreignAmount = Money.fromMinor(100000n, 'USD');

    expect(historicalRate.ok).toBe(true);
    expect(closingRate.ok).toBe(true);
    if (!historicalRate.ok || !closingRate.ok) return;

    const positionResult = MonetaryPosition.create({
      accountId: 'acc-ar-01',
      accountCode: '1.1.02.01',
      accountName: 'Accounts Receivable USD',
      positionType: 'ASSET',
      foreignAmount,
      historicalRate: historicalRate.value,
      closingRate: closingRate.value,
    });

    expect(positionResult.ok).toBe(true);
    if (!positionResult.ok) return;

    const pos = positionResult.value;
    expect(pos.calculateHistoricalBookValue().minorUnits).toBe(3600000n);
    expect(pos.calculateRevaluedMarketValue().minorUnits).toBe(3850000n);
    expect(pos.calculateUnrealizedDelta().minorUnits).toBe(250000n);

    const adj = pos.calculateForexAdjustment();
    expect(adj.isGain).toBe(true);
    expect(adj.adjustmentAmount.minorUnits).toBe(250000n);
  });

  it('calculates forex loss for a liability when exchange rate increases', () => {
    const historicalRate = ExchangeRate.of('36.00', 'USD', 'VES', new Date('2026-11-01'));
    const closingRate = ExchangeRate.of('38.50', 'USD', 'VES', new Date('2026-11-30'));
    const foreignAmount = Money.fromMinor(50000n, 'USD');

    if (!historicalRate.ok || !closingRate.ok) return;

    const positionResult = MonetaryPosition.create({
      accountId: 'acc-ap-01',
      accountCode: '2.1.01.01',
      accountName: 'Accounts Payable USD',
      positionType: 'LIABILITY',
      foreignAmount,
      historicalRate: historicalRate.value,
      closingRate: closingRate.value,
    });

    expect(positionResult.ok).toBe(true);
    if (!positionResult.ok) return;

    const pos = positionResult.value;
    const adj = pos.calculateForexAdjustment();
    expect(adj.isGain).toBe(false);
    expect(adj.adjustmentAmount.minorUnits).toBe(125000n);
  });
});
