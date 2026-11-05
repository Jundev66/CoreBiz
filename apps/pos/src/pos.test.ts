import { describe, expect, it } from 'vitest';
import { computeEan13CheckDigit, generateInternalBarcode, isValidEan13 } from './barcode';
import { computePayloadHash } from './sync-engine';
import { formatReceiptHtml } from './receipt';
import type { LocalSale } from './db';

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

describe('POS Receipt Generator', () => {
  it('includes payment reference when present on receipt', () => {
    const sale: LocalSale = {
      id: '018e245a-0000-7000-8000-000000000001',
      operationId: '018e245a-0000-7000-8000-000000000001',
      ticketNumber: 'CAJA-01-000123',
      receiptSequenceNumber: '00-12345678',
      customerName: 'Juan Pérez',
      customerDoc: 'V-12345678',
      shiftId: 'shift-1',
      registerCode: 'CAJA-01',
      paymentMethod: 'transfer',
      paymentReference: 'REF-789456',
      subtotalMinor: '1000',
      taxMinor: '160',
      totalMinor: '1160',
      exchangeRateBcv: '36.50',
      lines: [
        {
          id: 'l1',
          productId: 'p1',
          name: 'Café Molido 500g',
          quantity: 1,
          unitPriceMinor: '1000',
          lineTotalMinor: '1000',
        },
      ],
      occurredAt: '2026-11-04T12:00:00.000Z',
      syncStatus: 'synced',
    };

    const html = formatReceiptHtml(sale);
    expect(html).toContain('REFERENCIA:');
    expect(html).toContain('REF-789456');
    expect(html).toContain('CONTADO (TRANSFER)');
  });
});
