import { Body, Controller, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { setStatusSchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('catalogo')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/products')
export class SetProductStatusController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Patch(':id/status')
  @RequirePermission('product:write')
  @ApiOperation({ summary: 'Sacar del catalogo, o devolverlo' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: z.infer<typeof setStatusSchema>,
  ): Promise<{ archived: boolean }> {
    return unwrapOrThrow(
      await this.useCases.setProductStatus({ productId: id, archived: body.archived }),
    );
  }
}
