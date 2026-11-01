import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PendingInvitationView } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class GetInvitationsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('invitations')
  @RequirePermission('user:read')
  @ApiOperation({ summary: 'Invitaciones enviadas y todavia sin aceptar' })
  run(): Promise<readonly PendingInvitationView[]> {
    return this.runtime.queries.admin.pendingInvitations();
  }
}
