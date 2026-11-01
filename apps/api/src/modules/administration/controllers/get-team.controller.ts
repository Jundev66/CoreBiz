import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TeamMemberView } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class GetTeamController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('team')
  @RequirePermission('user:read')
  @ApiOperation({ summary: 'Quien tiene acceso a la empresa' })
  run(): Promise<readonly TeamMemberView[]> {
    return this.runtime.queries.admin.team();
  }
}
