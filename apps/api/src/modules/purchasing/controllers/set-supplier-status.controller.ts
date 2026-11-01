import { Body, Controller, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { setStatusSchema } from '@corebiz/contracts';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class SetSupplierStatusController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Patch('suppliers/:id/status')
  @RequirePermission('supplier:write')
  @ApiOperation({ summary: 'Archivar un proveedor, o devolverlo a la lista' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: z.infer<typeof setStatusSchema>,
  ): Promise<{ archived: boolean }> {
    return unwrapOrThrow(
      await this.useCases.setSupplierStatus({ supplierId: id, archived: body.archived }),
    );
  }
}
