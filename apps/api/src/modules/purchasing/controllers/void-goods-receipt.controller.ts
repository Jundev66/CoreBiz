import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { voidGoodsReceiptSchema } from '@corebiz/contracts';
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
export class VoidGoodsReceiptController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('receipts/:id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('purchase:void')
  @ApiOperation({ summary: 'Anular una recepcion, quitando del inventario lo que entro' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidGoodsReceiptSchema))
    body: z.infer<typeof voidGoodsReceiptSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.voidGoodsReceipt({ goodsReceiptId: id, reason: body.reason }),
    );
  }
}
