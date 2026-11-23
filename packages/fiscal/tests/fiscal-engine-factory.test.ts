import { describe, it, expect } from 'vitest';
import {
  createFiscalEngine,
  FiscalEngineRegistry,
} from '../src/infrastructure/fiscal-engine-factory';
import type { FiscalJurisdictionPort } from '../src/domain/index';
import { Money } from '@corebiz/shared-kernel';
import { RifMother } from './mothers/RifMother';

describe('FiscalEngineFactory & Registry', () => {
  it('creates Venezuela fiscal engine with VES national currency and RIF tax label', () => {
    const engine = createFiscalEngine('VE');
    expect(engine.jurisdictionCode).toBe('VE');
    expect(engine.nationalCurrency).toBe('VES');
    expect(engine.getTaxIdLabel()).toBe('RIF');
    expect(engine.validateTaxId(RifMother.corporate().value())).toBe(true);
    expect(engine.validateTaxId('invalid')).toBe(false);
  });

  it('creates United States fiscal engine with USD national currency and EIN tax label', () => {
    const engine = createFiscalEngine('US', { usSalesTaxRatePercentage: 8.25 });
    expect(engine.jurisdictionCode).toBe('US');
    expect(engine.nationalCurrency).toBe('USD');
    expect(engine.getTaxIdLabel()).toBe('EIN');
    expect(engine.validateTaxId('12-3456789')).toBe(true);
    expect(engine.validateTaxId('invalid')).toBe(false);
  });

  it('throws descriptive error when unsupported jurisdiction is requested', () => {
    expect(() => createFiscalEngine('UNKNOWN')).toThrowError(
      /Unsupported fiscal jurisdiction: UNKNOWN/,
    );
  });

  it('allows dynamic registration of future country jurisdiction without modifying existing code', () => {
    const mockColombiaEngine: FiscalJurisdictionPort = {
      jurisdictionCode: 'CO',
      nationalCurrency: 'USD',
      validateTaxId: (id) => id.startsWith('NIT-'),
      formatTaxId: (id) => id.trim(),
      getTaxIdLabel: () => 'NIT',
      calculateTaxes: () => ({ taxes: [], totalTax: Money.zero('USD') }),
      calculateRetentions: () => ({
        vatRetentionAmount: Money.zero('USD'),
        igtfAmount: Money.zero('USD'),
        totalWithheld: Money.zero('USD'),
      }),
    };

    FiscalEngineRegistry.register('CO', () => mockColombiaEngine);

    expect(FiscalEngineRegistry.has('CO')).toBe(true);
    const resolved = createFiscalEngine('CO');
    expect(resolved.jurisdictionCode).toBe('CO');
    expect(resolved.getTaxIdLabel()).toBe('NIT');
    expect(resolved.validateTaxId('NIT-900123456')).toBe(true);
    expect(resolved.validateTaxId('invalid')).toBe(false);
  });
});
