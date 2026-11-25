import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { createTaxRateConfigSchema } from '@corebiz/contracts';
import { TaxRateConfig } from '@corebiz/fiscal/domain';
import type { TenantContext } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { domainError } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME, TENANT_CONTEXT } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('fiscal')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/fiscal/tax-rates')
export class CreateTaxRateConfigController {
  constructor(
    @Inject(RUNTIME) private readonly runtime: Runtime,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('settings:write')
  @ApiOperation({ summary: 'Crear una nueva tasa de impuesto en el catalogo de la empresa' })
  async run(
    @Body(new ZodValidationPipe(createTaxRateConfigSchema))
    body: z.infer<typeof createTaxRateConfigSchema>,
  ) {
    const created = TaxRateConfig.create({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      code: body.code,
      name: body.name,
      rateBp: body.rateBp,
      jurisdiction: body.jurisdiction ?? this.ctx.settings.fiscalCountry ?? 'VE',
      isDefault: body.isDefault,
      isActive: true,
    });

    if (!created.ok) {
      throw domainError(created.error.kind);
    }

    await this.runtime.taxRateConfigs?.save(created.value);

    return {
      id: created.value.id,
      code: created.value.code,
      name: created.value.name,
      rateBp: created.value.rateBp,
      jurisdiction: created.value.jurisdiction,
      isDefault: created.value.isDefault,
      isActive: created.value.isActive,
    };
  }
}
