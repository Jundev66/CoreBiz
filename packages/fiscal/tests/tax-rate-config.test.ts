import { describe, it, expect } from 'vitest';
import { TaxRateConfig } from '../src/domain/model/tax-rate-config';
import { InMemoryTaxRateConfigRepository } from '../src/infrastructure/memory/in-memory-tax-rate-config-repository';

describe('TaxRateConfig & InMemoryTaxRateConfigRepository', () => {
  it('seeds VE default tax catalog and allows creating and switching default tax rate', async () => {
    const repo = new InMemoryTaxRateConfigRepository();
    const initial = await repo.listByTenant('tenant-ve', 'VE');
    expect(initial.map((t) => t.code)).toEqual(['IVA_16', 'IVA_8', 'EXENTO']);
    expect(initial.find((t) => t.isDefault)?.code).toBe('IVA_16');

    const luxury = TaxRateConfig.create({
      id: 'tax-lux',
      tenantId: 'tenant-ve',
      code: 'iva_31',
      name: 'IVA Suntuario (31%)',
      rateBp: 3100,
      jurisdiction: 'VE',
      isDefault: false,
      isActive: true,
    });
    expect(luxury.ok).toBe(true);
    if (luxury.ok) {
      await repo.save(luxury.value);
    }

    const updated = await repo.setDefault('tenant-ve', 'tax-lux');
    expect(updated).toBe(true);
    const after = await repo.listByTenant('tenant-ve', 'VE');
    expect(after.find((t) => t.isDefault)?.code).toBe('IVA_31');
  });

  it('rejects invalid tax rate outside 0..10000 basis points', () => {
    const invalid = TaxRateConfig.create({
      id: 'bad',
      tenantId: 't1',
      code: 'BAD',
      name: 'Invalid Tax',
      rateBp: 15000,
      jurisdiction: 'VE',
      isDefault: false,
      isActive: true,
    });
    expect(invalid.ok).toBe(false);
  });
});
