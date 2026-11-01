import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { GoodsReceiptView } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class GetGoodsReceiptByIdController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('receipts/:id')
  @RequirePermission('purchase:read')
  @ApiOperation({ summary: 'Una recepcion con su detalle' })
  async run(@Param('id') id: string): Promise<GoodsReceiptView> {
    const receipt = await this.runtime.queries.purchasing.receiptById(id);
    if (receipt === null) {
      throw new NotFoundException({ errorKind: 'GoodsReceiptNotFound', errorParams: { id } });
    }
    return receipt;
  }
}
