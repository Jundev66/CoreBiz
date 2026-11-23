import { describe, expect, it } from 'vitest';
import { Money } from '@corebiz/shared-kernel';
import { Rif } from '../src/domain/value-objects/rif';
import { VenezuelaFiscalEngine } from '../src/infrastructure/venezuela-fiscal-engine';

describe('VenezuelaFiscalEngine (SENIAT)', () => {
  const engine = new VenezuelaFiscalEngine();

  it('validates and formats Venezuelan RIFs', () => {
    const validRif = Rif.create('J-12345678-' + Rif.calculateCheckDigit('J', '12345678'));
    if (validRif.ok) {
      expect(engine.validateTaxId(validRif.value.value())).toBe(true);
      expect(engine.formatTaxId(validRif.value.compact())).toBe(validRif.value.value());
    }
    expect(engine.validateTaxId('X-00000000-0')).toBe(false);
    expect(engine.getTaxIdLabel()).toBe('RIF');
  });

  it('calculates 16% General VAT and 8% Reduced VAT', () => {
    const result = engine.calculateTaxes(
      [
        {
          lineId: 'l1',
          baseAmount: Money.fromMinor(10000n, 'USD'),
          taxTypeCode: 'IVA_GENERAL',
        },
        {
          lineId: 'l2',
          baseAmount: Money.fromMinor(10000n, 'USD'),
          taxTypeCode: 'IVA_REDUCIDO',
        },
      ],
      {
        taxId: 'J-12345678-9',
        isSpecialTaxpayer: false,
        isTaxExempt: false,
      },
    );

    expect(result.taxes).toHaveLength(2);
    expect(result.taxes[0]?.taxAmount.minorUnits).toBe(1600n);
    expect(result.taxes[1]?.taxAmount.minorUnits).toBe(800n);
    expect(result.totalTax.minorUnits).toBe(2400n);
  });

  it('returns zero tax for tax-exempt customer profile', () => {
    const result = engine.calculateTaxes(
      [
        {
          lineId: 'l1',
          baseAmount: Money.fromMinor(10000n, 'USD'),
          taxTypeCode: 'IVA_GENERAL',
        },
      ],
      {
        taxId: 'J-12345678-9',
        isSpecialTaxpayer: false,
        isTaxExempt: true,
      },
    );

    expect(result.totalTax.minorUnits).toBe(0n);
  });

  it('calculates 75% VAT withholding and 3% IGTF on foreign currency payments', () => {
    const retentions = engine.calculateRetentions({
      invoiceTotalTax: Money.fromMinor(1600n, 'USD'),
      customerProfile: {
        taxId: 'J-12345678-9',
        isSpecialTaxpayer: true,
        isTaxExempt: false,
      },
      paymentCurrency: 'USD',
      isForeignCurrencyPayment: true,
      paymentBaseAmount: Money.fromMinor(11600n, 'USD'),
    });

    expect(retentions.vatRetentionAmount.minorUnits).toBe(1200n);
    expect(retentions.igtfAmount.minorUnits).toBe(348n);
  });
});
