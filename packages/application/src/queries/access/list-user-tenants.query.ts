import type {
  TenantMembershipPort,
  UserTenantMembership,
} from '../../ports/tenant-membership.port';

export class ListUserTenantsQueryHandler {
  constructor(private readonly membershipPort: TenantMembershipPort) {}

  async execute(userId: string): Promise<readonly UserTenantMembership[]> {
    return this.membershipPort.listUserTenants(userId);
  }
}
