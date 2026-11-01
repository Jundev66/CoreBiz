import { Body, Controller, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { changeMemberRoleSchema } from '@corebiz/contracts';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class ChangeMemberRoleController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Patch('members/:userId')
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Cambiar el rol de un miembro' })
  async run(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(changeMemberRoleSchema))
    body: z.infer<typeof changeMemberRoleSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(await this.useCases.changeMemberRole({ userId, role: body.role }));
  }
}
