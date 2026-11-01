import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class GetAuditActionsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('audit/actions')
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Acciones distintas presentes en el registro, para el filtro' })
  run(): Promise<readonly string[]> {
    return this.runtime.queries.admin.auditActions();
  }
}
