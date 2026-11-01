import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { inviteUserSchema } from '@corebiz/contracts';
import { isRole } from '@corebiz/domain';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { domainError, unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class InviteUserController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('invitations')
  @RequirePermission('user:invite')
  @ApiOperation({ summary: 'Invitar a alguien a la empresa' })
  async run(
    @Body(new ZodValidationPipe(inviteUserSchema)) body: z.infer<typeof inviteUserSchema>,
  ): Promise<unknown> {
    if (!isRole(body.role)) {
      throw domainError('UnknownRole', { raw: body.role });
    }

    return unwrapOrThrow(await this.useCases.inviteUser({ email: body.email, role: body.role }));
  }
}
