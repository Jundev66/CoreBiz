import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('inventario')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/inventory/warehouses')
export class GetWarehouseStockController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get(':warehouseId/stock/:productId')
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Consultar existencia de un producto en un almacen especifico' })
  async run(@Param('warehouseId') warehouseId: string, @Param('productId') productId: string) {
    const stock = await this.useCases.getWarehouseStock.execute({
      tenantId: this.ctx.tenantId,
      warehouseId,
      productId,
    });

    return {
      warehouseId,
      productId,
      quantity: stock.toString(),
    };
  }
}
