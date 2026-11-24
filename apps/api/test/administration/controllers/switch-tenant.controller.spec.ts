import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { SwitchTenantController } from '../../../src/modules/administration/controllers/switch-tenant.controller';
import type { SessionMembership } from '@corebiz/infrastructure';

describe('SwitchTenantController', () => {
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
    {
      tenantId: '018e245a-0000-7000-8000-000000000003',
      slug: 'suspended-corp',
      name: 'Suspended Corp',
      role: 'sales',
      planCode: 'free',
      isDemo: false,
      status: 'suspended',
      taxLabel: 'RIF',
      taxRateBp: 1600,
      baseCurrency: 'USD',
      exchangeRateScaled: null,
      exchangeRateAt: null,
      expiresAt: null,
    },
  ];

  it('switches to target tenant successfully and returns active profile', () => {
    const controller = new SwitchTenantController(mockMemberships);
    const result = controller.run({
      targetTenantId: '018e245a-0000-7000-8000-000000000002',
    });

    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('018e245a-0000-7000-8000-000000000002');
    expect(result.tenantSlug).toBe('demo-corp-us');
    expect(result.fiscalCountry).toBe('US');
    expect(result.role).toBe('viewer');
    expect(result.currency).toBe('USD');
  });

  it('throws ForbiddenException when target tenant is not among user memberships', () => {
    const controller = new SwitchTenantController(mockMemberships);

    expect(() =>
      controller.run({
        targetTenantId: '018e245a-9999-7000-8000-000000000099',
      }),
    ).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user membership in target tenant is suspended', () => {
    const controller = new SwitchTenantController(mockMemberships);

    expect(() =>
      controller.run({
        targetTenantId: '018e245a-0000-7000-8000-000000000003',
      }),
    ).toThrow(ForbiddenException);
  });
});
