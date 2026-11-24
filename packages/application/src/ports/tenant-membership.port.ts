import type { Role } from '@corebiz/domain';
import type { TenantContext } from './repositories';

export interface UserTenantMembership {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly fiscalCountry: 'VE' | 'US';
  readonly currency: 'USD' | 'VES';
  readonly role: Role;
  readonly status: 'active' | 'invited' | 'suspended';
}

export interface TenantMembershipPort {
  listUserTenants(userId: string): Promise<readonly UserTenantMembership[]>;
  findMembership(tenantId: string, userId: string): Promise<UserTenantMembership | null>;
  resolveTenantContext(userId: string, targetTenantId: string): Promise<TenantContext | null>;
}
