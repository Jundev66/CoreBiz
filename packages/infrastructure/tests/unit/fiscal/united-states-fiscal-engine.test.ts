import { describe, expect, it } from 'vitest';
import { Money } from '@corebiz/domain';
import { UnitedStatesFiscalEngine } from '../../../src/fiscal/united-states-fiscal-engine';

describe('UnitedStatesFiscalEngine (US Sales Tax)', () => {
  const engine = new UnitedStatesFiscalEngine(7);

  it('validates and formats US EINs', () => {
    expect(engine.validateTaxId('12-3456789')).toBe(true);
    expect(engine.validateTaxId('123456789')).toBe(true);
    expect(engine.validateTaxId('12-345')).toBe(false);
    expect(engine.formatTaxId('123456789')).toBe('12-3456789');
    expect(engine.getTaxIdLabel()).toBe('EIN');
  });

  it('calculates 7% destination-based sales tax', () => {
    const result = engine.calculateTaxes(
      [
        {
          lineId: 'l1',
          baseAmount: Money.fromMinor(10000n, 'USD'),
          taxTypeCode: 'SALES_TAX',
        },
      ],
      {
        taxId: '12-3456789',
        isSpecialTaxpayer: false,
        isTaxExempt: false,
      },
    );

    expect(result.taxes).toHaveLength(1);
    expect(result.taxes[0]?.taxAmount.minorUnits).toBe(700n);
    expect(result.totalTax.minorUnits).toBe(700n);
  });

  it('applies 0% for tax-exempt entities with resale certificate', () => {
    const result = engine.calculateTaxes(
      [
        {
          lineId: 'l1',
          baseAmount: Money.fromMinor(10000n, 'USD'),
          taxTypeCode: 'SALES_TAX',
        },
      ],
      {
        taxId: '12-3456789',
        isSpecialTaxpayer: false,
        isTaxExempt: true,
      },
    );

    expect(result.totalTax.minorUnits).toBe(0n);
  });
});
