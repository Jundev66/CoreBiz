import type { TenantContext } from '../../ports/repositories';
import type {
  TenantMembershipPort,
  UserTenantMembership,
} from '../../ports/tenant-membership.port';
import { asId, Plan, type TenantId, type UserId } from '@corebiz/domain';

export class InMemoryTenantMembershipAdapter implements TenantMembershipPort {
  private readonly memberships = new Map<string, UserTenantMembership[]>();
  private readonly contexts = new Map<string, TenantContext>();

  addMembership(
    userId: string,
    membership: UserTenantMembership,
    customContext?: TenantContext,
  ): void {
    const list = this.memberships.get(userId) ?? [];
    this.memberships.set(userId, [
      ...list.filter((m) => m.tenantId !== membership.tenantId),
      membership,
    ]);

    const ctxKey = `${userId}:${membership.tenantId}`;
    if (customContext) {
      this.contexts.set(ctxKey, customContext);
    } else {
      const defaultContext: TenantContext = {
        tenantId: asId<TenantId>(membership.tenantId),
        tenantSlug: membership.tenantSlug,
        actor: {
          userId: asId<UserId>(userId),
          role: membership.role,
        },
        plan: Plan.of('free'),
        settings: {
          taxLabel: membership.fiscalCountry === 'VE' ? 'RIF' : 'EIN',
          taxRateBp: membership.fiscalCountry === 'VE' ? 1600 : 700,
          baseCurrency: membership.currency,
          exchangeRateScaled: 3600000000n,
          exchangeRateAt: new Date(),
        },
        isDemo: false,
      };
      this.contexts.set(ctxKey, defaultContext);
    }
  }

  listUserTenants(userId: string): Promise<readonly UserTenantMembership[]> {
    return Promise.resolve(this.memberships.get(userId) ?? []);
  }

  findMembership(tenantId: string, userId: string): Promise<UserTenantMembership | null> {
    const list = this.memberships.get(userId) ?? [];
    const found = list.find((m) => m.tenantId === tenantId) ?? null;
    return Promise.resolve(found);
  }

  resolveTenantContext(userId: string, targetTenantId: string): Promise<TenantContext | null> {
    const membership = (this.memberships.get(userId) ?? []).find(
      (m) => m.tenantId === targetTenantId,
    );
    if (!membership || membership.status !== 'active') {
      return Promise.resolve(null);
    }
    const ctx = this.contexts.get(`${userId}:${targetTenantId}`) ?? null;
    return Promise.resolve(ctx);
  }
}
