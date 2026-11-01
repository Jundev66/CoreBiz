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
export class RevokeInvitationController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Delete('invitations/:id')
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Revocar una invitacion sin aceptar' })
  async run(@Param('id') id: string): Promise<{ id: string }> {
    return unwrapOrThrow(await this.useCases.revokeInvitation(id));
  }
}
