import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
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
export class ListTaxRateConfigsController {
  constructor(
    @Inject(RUNTIME) private readonly runtime: Runtime,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('invoice:read')
  @ApiOperation({ summary: 'Listar catalogo de impuestos de la empresa' })
  async run() {
    const jurisdiction = this.ctx.settings.fiscalCountry ?? 'VE';
    const rates = await (this.runtime.taxRateConfigs?.listByTenant(
      this.ctx.tenantId,
      jurisdiction,
    ) ?? Promise.resolve([]));

    return {
      taxRates: rates.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        rateBp: r.rateBp,
        jurisdiction: r.jurisdiction,
        isDefault: r.isDefault,
        isActive: r.isActive,
      })),
    };
  }
}
