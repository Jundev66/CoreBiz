import { describe, expect, it } from 'vitest';
import { computeEan13CheckDigit, generateInternalBarcode, isValidEan13 } from './barcode';

describe('Barcode Domain Utilities', () => {
  it('computes check digit for known EAN-13 bases', () => {
    const base = '779123456789';
    const checkDigit = computeEan13CheckDigit(base);
    expect(checkDigit).toBeGreaterThanOrEqual(0);
    expect(checkDigit).toBeLessThanOrEqual(9);

    const full = `${base}${checkDigit}`;
    expect(isValidEan13(full)).toBe(true);
  });

  it('throws on invalid base length or characters', () => {
    expect(() => computeEan13CheckDigit('123')).toThrow('EAN-13 base must be exactly 12 digits');
    expect(() => computeEan13CheckDigit('12345678901a')).toThrow(
      'EAN-13 base must be exactly 12 digits',
    );
  });

  it('generates internal barcode with prefix 20 and counter', () => {
    const code = generateInternalBarcode(42);
    expect(code.startsWith('20')).toBe(true);
    expect(code.length).toBe(13);
    expect(isValidEan13(code)).toBe(true);
  });

  it('generates internal barcode with random digits when counter is omitted', () => {
    const code = generateInternalBarcode();
    expect(code.startsWith('20')).toBe(true);
    expect(code.length).toBe(13);
    expect(isValidEan13(code)).toBe(true);
  });

  it('validates corrupted and short barcodes correctly', () => {
    expect(isValidEan13('123')).toBe(false);
    expect(isValidEan13('12345678901234')).toBe(false);
    expect(isValidEan13('7791234567890')).toBe(false);
  });
});
