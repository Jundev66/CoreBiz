import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import type { ProductListItem } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { lowStockQuerySchema } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('catalogo')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/products')
export class GetLowStockProductsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('low-stock')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Productos por debajo de su minimo, para el panel' })
  run(
    @Query(new ZodValidationPipe(lowStockQuerySchema)) query: z.infer<typeof lowStockQuerySchema>,
  ): Promise<readonly ProductListItem[]> {
    return this.runtime.queries.products.lowStock(query.limit);
  }
}
