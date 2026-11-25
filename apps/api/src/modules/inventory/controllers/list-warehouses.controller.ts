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
@Controller('v1/inventory/warehouses')
export class ListWarehousesController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Listar almacenes y depositos fisicos de la empresa' })
  async run() {
    const warehouses = await this.useCases.listWarehouses.execute({
      tenantId: this.ctx.tenantId,
    });

    return warehouses.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      isDefault: w.isDefault,
      isActive: w.isActive,
      address: w.address ?? null,
    }));
  }
}
