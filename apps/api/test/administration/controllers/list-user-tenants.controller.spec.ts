import { describe, it, expect } from 'vitest';
import { ListUserTenantsController } from '../../../src/modules/administration/controllers/list-user-tenants.controller';
import type { SessionMembership } from '@corebiz/infrastructure';

describe('ListUserTenantsController', () => {
  it('maps session memberships to multi-country tenant summary response', () => {
    const mockMemberships: readonly SessionMembership[] = [
      {
        tenantId: '018e245a-0000-7000-8000-000000000001',
        slug: 'empresa-demo-ve',
        name: 'Empresa Demo C.A.',
        role: 'owner',
        planCode: 'free',
        isDemo: false,
        status: 'active',
        taxLabel: 'RIF',
        taxRateBp: 1600,
        baseCurrency: 'USD',
        exchangeRateScaled: 3600000000n,
        exchangeRateAt: new Date('2026-11-23T12:00:00Z'),
        expiresAt: null,
      },
      {
        tenantId: '018e245a-0000-7000-8000-000000000002',
        slug: 'demo-corp-us',
        name: 'Demo Corp LLC',
        role: 'viewer',
        planCode: 'free',
        isDemo: false,
        status: 'active',
        taxLabel: 'EIN',
        taxRateBp: 700,
        baseCurrency: 'USD',
        exchangeRateScaled: null,
        exchangeRateAt: null,
        expiresAt: null,
      },
    ];

    const controller = new ListUserTenantsController(mockMemberships);
    const result = controller.run();

    expect(result.tenants).toHaveLength(2);
    expect(result.tenants[0]?.tenantId).toBe('018e245a-0000-7000-8000-000000000001');
    expect(result.tenants[0]?.fiscalCountry).toBe('VE');
    expect(result.tenants[0]?.role).toBe('owner');
    expect(result.tenants[1]?.tenantId).toBe('018e245a-0000-7000-8000-000000000002');
    expect(result.tenants[1]?.fiscalCountry).toBe('US');
    expect(result.tenants[1]?.role).toBe('viewer');
  });

  it('handles empty memberships gracefully', () => {
    const controller = new ListUserTenantsController([]);
    const result = controller.run();
    expect(result.tenants).toEqual([]);
  });
});
