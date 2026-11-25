import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('inventario')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/inventory/audits')
export class ListInventoryAuditsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Listar tomas fisicas de inventario del tenant' })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  async run(@Query('warehouseId') warehouseId?: string) {
    return this.useCases.listInventoryAudits.execute({
      tenantId: this.ctx.tenantId,
      warehouseId,
    });
  }
}
