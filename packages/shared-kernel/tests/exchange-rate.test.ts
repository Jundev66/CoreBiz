import { describe, it, expect } from 'vitest';
import { ExchangeRate } from '../src/value-objects/exchange-rate';
import { Money } from '../src/value-objects/money';
import { unwrap } from '../src/result';

const AT = new Date('2026-03-15T10:00:00.000Z');
const rate = (v: string, at: Date = AT) => unwrap(ExchangeRate.of(v, 'USD', 'VES', at));
const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const ves = (v: string) => unwrap(Money.of(v, 'VES'));

describe('ExchangeRate construction', () => {
  it('accepts comma as decimal separator', () => {
    expect(rate('36,50').toCompactString()).toBe('36.5');
  });

  it('rejects zero or negative rates', () => {
    for (const bad of ['0', '-1', '0,00']) {
      expect(ExchangeRate.of(bad, 'USD', 'VES', AT).ok).toBe(false);
    }
  });

  it('rejects converting currency to itself', () => {
    const result = ExchangeRate.of('1', 'USD', 'USD', AT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('UnconvertiblePair');
  });
});

describe('ExchangeRate conversion', () => {
  it('converts from USD to VES', () => {
    expect(unwrap(rate('36,50').convert(usd('100'))).toString()).toBe('3650.00');
  });

  it('converts reversely from VES to USD', () => {
    const back = unwrap(rate('36,50').convert(ves('3650.00')));
    expect(back.currency).toBe('USD');
    expect(back.toString()).toBe('100.00');
  });

  it('rounds to target minor units', () => {
    expect(unwrap(rate('36,50').convert(usd('33.33'))).toString()).toBe('1216.55');
  });

  it('maintains precision with multi-decimal rates', () => {
    expect(unwrap(rate('36,12345678').convert(usd('100'))).toString()).toBe('3612.35');
  });

  it('allows converting either currency of pair', () => {
    const foreign = Money.fromMinor(100n, 'VES');
    const other = unwrap(ExchangeRate.of('1,08', 'USD', 'VES', AT));
    expect(other.convert(foreign).ok).toBe(true);
  });
});

describe('ExchangeRate immutability', () => {
  it('protects capturedAt against external mutation', () => {
    const captured = new Date('2026-03-15T10:00:00.000Z');
    const r = rate('36,50', captured);
    captured.setFullYear(2030);
    expect(r.capturedAt.toISOString()).toBe('2026-03-15T10:00:00.000Z');
  });

  it('preserves historical conversion when later rates change', () => {
    const marchRate = rate('36,50', new Date('2026-03-15T10:00:00.000Z'));
    const documentTotal = unwrap(marchRate.convert(usd('250')));

    const septemberRate = rate('54,20', new Date('2026-09-01T10:00:00.000Z'));

    expect(documentTotal.toString()).toBe('9125.00');
    expect(unwrap(septemberRate.convert(usd('250'))).toString()).toBe('13550.00');
    expect(marchRate.toCompactString()).toBe('36.5');
  });

  it('round-trips through scaled database representation', () => {
    const original = rate('36,50');
    const restored = ExchangeRate.fromScaled(
      original.scaledRate,
      original.from,
      original.to,
      original.capturedAt,
    );
    expect(restored.equals(original)).toBe(true);
  });
});
