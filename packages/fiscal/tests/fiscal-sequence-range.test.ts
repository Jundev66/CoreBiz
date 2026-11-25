import { describe, expect, it } from 'vitest';
import { FiscalSequenceRange } from '../src/domain/model/fiscal-sequence-range';

describe('FiscalSequenceRange Domain Model', () => {
  it('creates active fiscal sequence range and advances numbers monotonically', () => {
    const rangeRes = FiscalSequenceRange.create({
      id: 'range-01',
      tenantId: 'tenant-01',
      jurisdiction: 'VE',
      documentType: 'INVOICE',
      prefix: 'FAC-',
      fromNumber: 1n,
      toNumber: 100n,
    });

    expect(rangeRes.ok).toBe(true);
    if (rangeRes.ok) {
      const range = rangeRes.value;
      expect(range.status).toBe('ACTIVE');
      expect(range.currentNumber).toBe(0n);
      expect(range.remainingNumbers).toBe(100n);

      const next1 = range.nextSequence();
      expect(next1.ok).toBe(true);
      if (next1.ok) {
        expect(next1.value.assignedNumber).toBe(1n);
        expect(next1.value.formattedNumber).toBe('FAC-00000001');
        expect(next1.value.range.currentNumber).toBe(1n);
        expect(next1.value.range.remainingNumbers).toBe(99n);

        const next2 = next1.value.range.nextSequence();
        expect(next2.ok).toBe(true);
        if (next2.ok) {
          expect(next2.value.assignedNumber).toBe(2n);
          expect(next2.value.formattedNumber).toBe('FAC-00000002');
        }
      }
    }
  });

  it('rejects sequence creation with invalid bounds', () => {
    const res = FiscalSequenceRange.create({
      id: 'range-invalid',
      tenantId: 'tenant-01',
      jurisdiction: 'VE',
      documentType: 'CONTROL_NUMBER',
      prefix: '00-',
      fromNumber: 500n,
      toNumber: 100n,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('InvalidRangeBounds');
    }
  });

  it('transitions to EXHAUSTED when current number reaches upper bound', () => {
    const rangeRes = FiscalSequenceRange.create({
      id: 'range-exhaust',
      tenantId: 'tenant-01',
      jurisdiction: 'VE',
      documentType: 'INVOICE',
      prefix: '',
      fromNumber: 1n,
      toNumber: 2n,
      currentNumber: 1n,
    });

    expect(rangeRes.ok).toBe(true);
    if (rangeRes.ok) {
      const range = rangeRes.value;
      const nextRes = range.nextSequence();
      expect(nextRes.ok).toBe(true);
      if (nextRes.ok) {
        expect(nextRes.value.assignedNumber).toBe(2n);
        expect(nextRes.value.range.status).toBe('EXHAUSTED');

        const failedRes = nextRes.value.range.nextSequence();
        expect(failedRes.ok).toBe(false);
        if (!failedRes.ok) {
          expect(failedRes.error.kind).toBe('FiscalSequenceExhausted');
        }
      }
    }
  });

  it('transitions to EXPIRED when current date exceeds expiration date', () => {
    const expiredDate = new Date('2026-10-31');
    const rangeRes = FiscalSequenceRange.create(
      {
        id: 'range-exp',
        tenantId: 'tenant-01',
        jurisdiction: 'VE',
        documentType: 'INVOICE',
        prefix: '00-',
        fromNumber: 1n,
        toNumber: 1000n,
        expiresAt: expiredDate,
      },
      new Date('2026-10-01'),
    );

    expect(rangeRes.ok).toBe(true);
    if (rangeRes.ok) {
      const range = rangeRes.value;
      const failedRes = range.nextSequence(new Date('2026-11-24'));
      expect(failedRes.ok).toBe(false);
      if (!failedRes.ok) {
        expect(failedRes.error.kind).toBe('FiscalSequenceExpired');
      }
    }
  });

  it('detects near exhaustion and near expiration thresholds', () => {
    const rangeRes = FiscalSequenceRange.create({
      id: 'range-warn',
      tenantId: 'tenant-01',
      jurisdiction: 'VE',
      documentType: 'INVOICE',
      prefix: '',
      fromNumber: 1n,
      toNumber: 100n,
      currentNumber: 95n,
      warningThreshold: 10,
      expiresAt: new Date('2026-12-05'),
    });

    expect(rangeRes.ok).toBe(true);
    if (rangeRes.ok) {
      const range = rangeRes.value;
      expect(range.isNearExhaustion).toBe(true);
      expect(range.isNearExpiration(new Date('2026-11-24'), 15)).toBe(true);
      expect(range.isNearExpiration(new Date('2026-11-10'), 15)).toBe(false);
    }
  });
});
