import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { adjustStockSchema } from '@corebiz/contracts';
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
export class AdjustProductStockController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post(':id/stock-adjustments')
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Fijar el saldo de inventario, dejando rastro del motivo' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adjustStockSchema)) body: z.infer<typeof adjustStockSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.adjustStock({
        productId: id,
        newBalance: body.newBalance,
        reason: body.reason,
      }),
    );
  }
}
