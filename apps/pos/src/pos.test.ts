import { describe, expect, it } from 'vitest';
import { computeEan13CheckDigit, generateInternalBarcode, isValidEan13 } from './barcode';
import { computePayloadHash } from './sync-engine';

describe('POS Barcode Utilities', () => {
  it('computes exact GS1 check digit for known EAN-13 barcodes', () => {
    const base = '779123456789';
    const checkDigit = computeEan13CheckDigit(base);
    expect(checkDigit).toBeGreaterThanOrEqual(0);
    expect(checkDigit).toBeLessThanOrEqual(9);

    const fullBarcode = `${base}${checkDigit}`;
    expect(isValidEan13(fullBarcode)).toBe(true);
  });

  it('generates standard 13-digit internal barcodes with store prefix 20', () => {
    const barcode1 = generateInternalBarcode();
    expect(barcode1.length).toBe(13);
    expect(barcode1.startsWith('20')).toBe(true);
    expect(isValidEan13(barcode1)).toBe(true);

    const barcode2 = generateInternalBarcode(12345);
    expect(barcode2.length).toBe(13);
    expect(barcode2.startsWith('20')).toBe(true);
    expect(isValidEan13(barcode2)).toBe(true);
  });

  it('detects invalid EAN-13 check digit', () => {
    const invalid = '7791234567890';
    const base = invalid.slice(0, 12);
    const actualCheck = computeEan13CheckDigit(base);
    const corrupted = `${base}${(actualCheck + 1) % 10}`;
    expect(isValidEan13(corrupted)).toBe(false);
  });
});

describe('POS Sync Engine Hasher', () => {
  it('computes deterministic 64-character SHA-256 hash', async () => {
    const payload = { operationId: 'op-1', ticket: 'POS-01-0001', total: '1500' };
    const hash1 = await computePayloadHash(payload);
    const hash2 = await computePayloadHash(payload);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
  });
});
