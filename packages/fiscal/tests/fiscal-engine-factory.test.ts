import { describe, it, expect } from 'vitest';
import { createFiscalEngine } from '../src/infrastructure/fiscal-engine-factory';
import { RifMother } from './mothers/RifMother';

describe('FiscalEngineFactory', () => {
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
});
