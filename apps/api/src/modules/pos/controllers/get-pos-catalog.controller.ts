import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { catalogDeltaQuerySchema, type CatalogDeltaQuery } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class GetPosCatalogController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('catalog')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Descargar catalogo delta para operacion offline' })
  async run(@Query(new ZodValidationPipe(catalogDeltaQuerySchema)) query: CatalogDeltaQuery) {
    const catalogPage = await this.runtime.queries.products.list({
      limit: query.limit,
    });

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
      serverTime: new Date().toISOString(),
    };
  }
}
