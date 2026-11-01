import { Controller, Delete, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class RemoveMemberController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Delete('members/:userId')
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Quitar el acceso de alguien a la empresa' })
  async run(@Param('userId') userId: string): Promise<{ userId: string }> {
    return unwrapOrThrow(await this.useCases.removeMember(userId));
  }
}
