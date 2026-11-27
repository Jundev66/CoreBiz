import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@corebiz/application';
import { catalogDeltaQuerySchema, type CatalogDeltaQuery } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME, TENANT_CONTEXT } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class GetPosCatalogController {
  constructor(
    @Inject(RUNTIME) private readonly runtime: Runtime,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get('catalog')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Descargar catalogo delta para operacion offline' })
  async run(@Query(new ZodValidationPipe(catalogDeltaQuerySchema)) query: CatalogDeltaQuery) {
    const catalogPage = await this.runtime.queries.products.list({
      limit: query.limit,
      ...(query.since ? { since: new Date(query.since) } : {}),
    });

    const exchangeRate =
      this.ctx.settings.exchangeRateScaled !== null && this.ctx.settings.exchangeRateScaled > 0n
        ? (Number(this.ctx.settings.exchangeRateScaled) / 100_000_000).toFixed(2)
        : null;

    return {
      items: catalogPage.items.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        price: p.price,
        trackStock: p.trackStock,
        onHand: p.onHand ?? '0',
      })),
      settings: {
        exchangeRate,
        baseCurrency: this.ctx.settings.baseCurrency,
        fiscalCountry: this.ctx.settings.fiscalCountry ?? 'VE',
      },
      serverTime: new Date().toISOString(),
    };
  }
}
