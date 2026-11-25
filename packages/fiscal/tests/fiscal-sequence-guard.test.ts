import { describe, expect, it } from 'vitest';
import { FiscalSequenceGuard } from '../src/application/services/fiscal-sequence-guard';
import { InMemoryFiscalSequenceRangeRepository } from '../src/infrastructure/memory/in-memory-fiscal-sequence-range-repository';
import { FiscalSequenceRange } from '../src/domain/model/fiscal-sequence-range';

describe('FiscalSequenceGuard', () => {
  it('bypasses sequence requirement for US jurisdiction', async () => {
    const repo = new InMemoryFiscalSequenceRangeRepository();
    const guard = new FiscalSequenceGuard(repo);

    const result = await guard.advance('tenant-us-01', 'US', 'INVOICE');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.assignedNumber).toBeUndefined();
    }
  });

  it('fails when statutory jurisdiction has no active sequence range registered', async () => {
    const repo = new InMemoryFiscalSequenceRangeRepository();
    const guard = new FiscalSequenceGuard(repo);

    const result = await guard.advance('tenant-ve-01', 'VE', 'INVOICE');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NoActiveFiscalSequenceRange');
    }
  });

  it('advances sequential number and returns formatted number for statutory jurisdiction', async () => {
    const repo = new InMemoryFiscalSequenceRangeRepository();
    const guard = new FiscalSequenceGuard(repo);

    const rangeRes = FiscalSequenceRange.create({
      id: 'seq-ve-01',
      tenantId: 'tenant-ve-01',
      jurisdiction: 'VE',
      documentType: 'CONTROL_NUMBER',
      prefix: '00-',
      fromNumber: 1n,
      toNumber: 500n,
    });
    if (rangeRes.ok) {
      await repo.save(rangeRes.value);
    }

    const result = await guard.advance('tenant-ve-01', 'VE', 'CONTROL_NUMBER', '00-');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.assignedNumber).toBe(1n);
      expect(result.value.formattedNumber).toBe('00-00000001');
      expect(result.value.remainingNumbers).toBe(499n);
    }
  });
});
