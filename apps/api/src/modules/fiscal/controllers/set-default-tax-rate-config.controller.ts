import { Controller, Inject, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME, TENANT_CONTEXT } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('fiscal')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/fiscal/tax-rates')
export class SetDefaultTaxRateConfigController {
  constructor(
    @Inject(RUNTIME) private readonly runtime: Runtime,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Patch(':id/default')
  @RequirePermission('settings:write')
  @ApiOperation({ summary: 'Establecer el impuesto por defecto de la empresa' })
  async run(@Param('id') id: string) {
    const updated = (await this.runtime.taxRateConfigs?.setDefault(this.ctx.tenantId, id)) ?? false;
    if (!updated) {
      throw new NotFoundException('TaxRateConfigNotFound');
    }
    return { updated: true, id };
  }
}
