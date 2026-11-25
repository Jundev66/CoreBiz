import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('inventario')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/inventory/audits')
export class GetInventoryAuditDetailsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get(':id')
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Obtener detalle de toma fisica de inventario' })
  @ApiQuery({ name: 'maskBlind', required: false, type: Boolean })
  async run(@Param('id') id: string, @Query('maskBlind') maskBlind?: string) {
    const isMaskBlind = maskBlind !== undefined ? maskBlind === 'true' : undefined;
    const result = await this.useCases.getInventoryAuditDetails.execute({
      tenantId: this.ctx.tenantId,
      auditId: id,
      maskBlind: isMaskBlind,
    });

    return unwrapOrThrow(result);
  }
}
