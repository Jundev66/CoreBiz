import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('inventario')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/inventory/transfers')
export class ListTransfersController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Listar traslados entre almacenes' })
  async run() {
    const transfers = await this.useCases.listTransfers.execute({
      tenantId: this.ctx.tenantId,
    });

    return transfers.map((t) => ({
      id: t.id,
      transferNumber: t.transferNumber,
      sourceWarehouseId: t.sourceWarehouseId,
      destinationWarehouseId: t.destinationWarehouseId,
      status: t.status,
      notes: t.notes ?? null,
      lines: t.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity.toString(),
      })),
      initiatedAt: t.initiatedAt ? t.initiatedAt.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      cancelledAt: t.cancelledAt ? t.cancelledAt.toISOString() : null,
      cancelReason: t.cancelReason ?? null,
    }));
  }
}
