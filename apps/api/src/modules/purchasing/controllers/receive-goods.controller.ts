import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { receiveGoodsSchema } from '@corebiz/contracts';
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
export class ReceiveGoodsController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('receipts')
  @RequirePermission('purchase:receive')
  @ApiOperation({ summary: 'Registrar la entrada de mercancia y actualizar el inventario' })
  async run(
    @Body(new ZodValidationPipe(receiveGoodsSchema)) body: z.infer<typeof receiveGoodsSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.receiveGoods({
        supplierId: body.supplierId,
        lines: body.lines,
        supplierReference: body.supplierReference || null,
        notes: body.notes || null,
      }),
    );
  }
}
