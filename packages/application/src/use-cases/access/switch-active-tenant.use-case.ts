import { err, ok, type Result } from '@corebiz/domain';
import type { TenantContext } from '../../ports/repositories';
import type { TenantMembershipPort } from '../../ports/tenant-membership.port';

export interface SwitchActiveTenantInput {
  readonly userId: string;
  readonly targetTenantId: string;
}

export type SwitchActiveTenantError =
  | { kind: 'UserNotMember'; tenantId: string }
  | { kind: 'MembershipSuspended'; tenantId: string }
  | { kind: 'TenantNotFound'; tenantId: string };

export class SwitchActiveTenantUseCase {
  constructor(private readonly membershipPort: TenantMembershipPort) {}

  async execute(
    input: SwitchActiveTenantInput,
  ): Promise<Result<TenantContext, SwitchActiveTenantError>> {
    const membership = await this.membershipPort.findMembership(input.targetTenantId, input.userId);
    if (!membership) {
      return err({ kind: 'UserNotMember', tenantId: input.targetTenantId });
    }

    if (membership.status === 'suspended') {
      return err({ kind: 'MembershipSuspended', tenantId: input.targetTenantId });
    }

    const context = await this.membershipPort.resolveTenantContext(
      input.userId,
      input.targetTenantId,
    );
    if (!context) {
      return err({ kind: 'TenantNotFound', tenantId: input.targetTenantId });
    }

    return ok(context);
  }
}
