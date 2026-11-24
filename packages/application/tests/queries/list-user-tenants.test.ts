import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTenantMembershipAdapter } from '../../src/adapters/memory/tenant-membership';
import { ListUserTenantsQueryHandler } from '../../src/queries/access/list-user-tenants.query';

describe('ListUserTenantsQueryHandler', () => {
  let adapter: InMemoryTenantMembershipAdapter;
  let query: ListUserTenantsQueryHandler;

  beforeEach(() => {
    adapter = new InMemoryTenantMembershipAdapter();
    query = new ListUserTenantsQueryHandler(adapter);

    adapter.addMembership('user-001', {
      tenantId: '018e245a-0000-7000-8000-000000000001',
      tenantSlug: 'empresa-demo-ve',
      tenantName: 'Empresa Demo C.A.',
      fiscalCountry: 'VE',
      currency: 'USD',
      role: 'owner',
      status: 'active',
    });

    adapter.addMembership('user-001', {
      tenantId: '018e245a-0000-7000-8000-000000000002',
      tenantSlug: 'demo-corp-us',
      tenantName: 'Demo Corp LLC',
      fiscalCountry: 'US',
      currency: 'USD',
      role: 'viewer',
      status: 'active',
    });
  });

  it('queries all tenants assigned to the specified user', async () => {
    const list = await query.execute('user-001');

    expect(list).toHaveLength(2);
    expect(list[0]?.fiscalCountry).toBe('VE');
    expect(list[0]?.role).toBe('owner');
    expect(list[1]?.fiscalCountry).toBe('US');
    expect(list[1]?.role).toBe('viewer');
  });

  it('returns empty list when user has no active memberships', async () => {
    const list = await query.execute('user-unknown');
    expect(list).toEqual([]);
  });
});
