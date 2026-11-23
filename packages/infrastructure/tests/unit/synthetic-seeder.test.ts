import { describe, expect, it } from 'vitest';
import { getSyntheticSeed, SyntheticSeederRegistry, type SyntheticTenantSeed } from '@corebiz/db';

describe('Synthetic Demo Seeder Registry', () => {
  it('provides complete synthetic data for Venezuela jurisdiction', () => {
    const seed = getSyntheticSeed('VE');

    expect(seed.jurisdiction).toBe('VE');
    expect(seed.name).toBe('Empresa Demo C.A.');
    expect(seed.taxId).toBe('J-50123456-7');
    expect(seed.taxRateBp).toBe(1600);
    expect(seed.isDualCurrency).toBe(true);
    expect(seed.customers.length).toBeGreaterThanOrEqual(3);
    expect(seed.products.length).toBeGreaterThanOrEqual(5);
    expect(seed.chartOfAccounts.length).toBeGreaterThanOrEqual(9);

    for (const cust of seed.customers) {
      expect(cust.taxId).toMatch(/^[VJGE]-[0-9]{8}-[0-9]$|^V-00000000$/);
      expect(cust.email).toContain('.test');
    }

    const cashAccount = seed.chartOfAccounts.find((a) => a.code === '1.1.01.01.001');
    expect(cashAccount).toBeDefined();
    expect(cashAccount?.type).toBe('asset');
  });

  it('provides complete synthetic data for United States jurisdiction', () => {
    const seed = getSyntheticSeed('US');

    expect(seed.jurisdiction).toBe('US');
    expect(seed.name).toBe('Demo Store Inc.');
    expect(seed.taxId).toBe('12-3456789');
    expect(seed.taxRateBp).toBe(700);
    expect(seed.isDualCurrency).toBe(false);
    expect(seed.customers.length).toBeGreaterThanOrEqual(3);
    expect(seed.products.length).toBeGreaterThanOrEqual(5);
    expect(seed.chartOfAccounts.length).toBeGreaterThanOrEqual(9);

    for (const cust of seed.customers) {
      expect(cust.taxId).toMatch(/^[0-9]{2}-[0-9]{7}$/);
      expect(cust.email).toContain('.test');
    }

    const cashAccount = seed.chartOfAccounts.find((a) => a.code === '1010');
    expect(cashAccount).toBeDefined();
    expect(cashAccount?.type).toBe('asset');
  });

  it('allows registering a new country synthetic seed dynamically', () => {
    const spainSeed: SyntheticTenantSeed = {
      jurisdiction: 'ES' as unknown as 'VE',
      slug: 'demo-espana-sl',
      name: 'Comercial Demo España S.L.',
      taxId: 'B-12345678',
      taxIdLabel: 'NIF / CIF',
      taxLabel: 'IVA (21%)',
      taxRateBp: 2100,
      baseCurrency: 'EUR',
      isDualCurrency: false,
      address: 'Calle Gran Via 1, Madrid, España',
      customers: [
        {
          code: 'CLI-ES-01',
          name: 'Cliente Mostrador España',
          taxId: '00000000T',
          email: 'mostrador@demo-es.test',
          phone: '+34 91 555 0101',
          address: 'Madrid, España',
        },
      ],
      products: [
        {
          sku: 'SKU-ES-001',
          name: 'Aceite de Oliva Virgen Extra 1L',
          category: 'Alimentacion',
          unit: 'unidad',
          priceMinor: 950n,
          onHand: 50000n,
        },
      ],
      chartOfAccounts: [
        { code: '570', name: 'Caja, euros', type: 'asset' },
        { code: '430', name: 'Clientes', type: 'asset' },
      ],
    };

    SyntheticSeederRegistry.register('ES', spainSeed);
    expect(SyntheticSeederRegistry.has('ES')).toBe(true);

    const resolved = getSyntheticSeed('ES');
    expect(resolved.name).toBe('Comercial Demo España S.L.');
    expect(resolved.taxRateBp).toBe(2100);
  });
});
