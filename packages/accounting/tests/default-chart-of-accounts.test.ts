import { describe, it, expect } from 'vitest';
import {
  createDefaultAccountsForJurisdiction,
  ChartOfAccountsRegistry,
} from '../src/domain/templates/default-chart-of-accounts';

describe('createDefaultAccountsForJurisdiction & ChartOfAccountsRegistry', () => {
  const tenantId = 'tenant-multi-country-01';

  it('generates Venezuelan FCCPV chart with IVA, IGTF, and retentions accounts', () => {
    const accounts = createDefaultAccountsForJurisdiction(tenantId, 'VE');
    expect(accounts.length).toBe(11);

    const codes = accounts.map((a) => a.code.value);
    expect(codes).toContain('1.1.01');
    expect(codes).toContain('2.1.02');
    expect(codes).toContain('2.1.03');
    expect(codes).toContain('2.1.04');
    expect(codes).toContain('4.1.01');

    const igtfAccount = accounts.find((a) => a.code.value === '2.1.04');
    expect(igtfAccount?.name).toBe('IGTF por Pagar');
    expect(igtfAccount?.normalSide).toBe('CREDIT');
  });

  it('generates US GAAP chart with Sales Tax Payable and 4-digit codes', () => {
    const accounts = createDefaultAccountsForJurisdiction(tenantId, 'US');
    expect(accounts.length).toBe(9);

    const codes = accounts.map((a) => a.code.value);
    expect(codes).toContain('1010');
    expect(codes).toContain('1200');
    expect(codes).toContain('2010');
    expect(codes).toContain('2050');
    expect(codes).toContain('4010');

    const salesTaxAccount = accounts.find((a) => a.code.value === '2050');
    expect(salesTaxAccount?.name).toBe('Sales Tax Payable');
    expect(salesTaxAccount?.normalSide).toBe('CREDIT');
  });

  it('throws descriptive error for unregistered jurisdiction', () => {
    expect(() => createDefaultAccountsForJurisdiction(tenantId, 'UNKNOWN')).toThrowError(
      /No chart of accounts template registered for jurisdiction: UNKNOWN/,
    );
  });

  it('allows registering a future country template without modifying existing code', () => {
    ChartOfAccountsRegistry.register('CO', [
      { code: '1105', name: 'Caja General', category: 'ASSET', isReconcilable: true },
      {
        code: '2408',
        name: 'Impuesto sobre las Ventas por Pagar',
        category: 'LIABILITY',
        isReconcilable: false,
      },
      {
        code: '4135',
        name: 'Comercio al por mayor y al por menor',
        category: 'REVENUE',
        isReconcilable: false,
      },
    ]);

    expect(ChartOfAccountsRegistry.has('CO')).toBe(true);
    const coAccounts = createDefaultAccountsForJurisdiction(tenantId, 'CO');
    expect(coAccounts.length).toBe(3);
    expect(coAccounts[0]?.code.value).toBe('1105');
    expect(coAccounts[0]?.name).toBe('Caja General');
  });
});
