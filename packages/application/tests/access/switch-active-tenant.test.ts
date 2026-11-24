import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTenantMembershipAdapter } from '../../src/adapters/memory/tenant-membership';
import { SwitchActiveTenantUseCase } from '../../src/use-cases/access/switch-active-tenant.use-case';

describe('SwitchActiveTenantUseCase', () => {
  let adapter: InMemoryTenantMembershipAdapter;
  let useCase: SwitchActiveTenantUseCase;

  beforeEach(() => {
    adapter = new InMemoryTenantMembershipAdapter();
    useCase = new SwitchActiveTenantUseCase(adapter);

    adapter.addMembership('user-001', {
      tenantId: 'tenant-ve-01',
      tenantSlug: 'empresa-demo-ve',
      tenantName: 'Empresa Demo C.A.',
      fiscalCountry: 'VE',
      currency: 'USD',
      role: 'owner',
      status: 'active',
    });

    adapter.addMembership('user-001', {
      tenantId: 'tenant-us-02',
      tenantSlug: 'demo-corp-us',
      tenantName: 'Demo Corp LLC',
      fiscalCountry: 'US',
      currency: 'USD',
      role: 'viewer',
      status: 'active',
    });
  });

  it('lists multi-company memberships and switches active tenant context successfully', async () => {
    const tenants = await adapter.listUserTenants('user-001');
    expect(tenants).toHaveLength(2);
    expect(tenants[0]?.fiscalCountry).toBe('VE');
    expect(tenants[0]?.role).toBe('owner');
    expect(tenants[1]?.fiscalCountry).toBe('US');
    expect(tenants[1]?.role).toBe('viewer');

    const result = await useCase.execute({
      userId: 'user-001',
      targetTenantId: 'tenant-us-02',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.tenantId).toBe('tenant-us-02');
    expect(result.value.tenantSlug).toBe('demo-corp-us');
    expect(result.value.actor.role).toBe('viewer');
    expect(result.value.settings.taxLabel).toBe('EIN');
  });

  it('returns error when user is not a member of target tenant', async () => {
    const result = await useCase.execute({
      userId: 'user-001',
      targetTenantId: 'tenant-unknown',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('UserNotMember');
  });

  it('returns error when user membership in target tenant is suspended', async () => {
    adapter.addMembership('user-001', {
      tenantId: 'tenant-suspended',
      tenantSlug: 'suspended-org',
      tenantName: 'Suspended Org',
      fiscalCountry: 'US',
      currency: 'USD',
      role: 'sales',
      status: 'suspended',
    });

    const result = await useCase.execute({
      userId: 'user-001',
      targetTenantId: 'tenant-suspended',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('MembershipSuspended');
  });
});
