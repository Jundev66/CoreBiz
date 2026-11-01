import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { StockMovementItem } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

const movementsQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();

@ApiTags('catalogo')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/products')
export class GetProductMovementsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get(':id/movements')
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Ultimos movimientos de inventario, del mas reciente al mas antiguo' })
  run(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(movementsQuerySchema)) query: z.infer<typeof movementsQuerySchema>,
  ): Promise<readonly StockMovementItem[]> {
    return this.runtime.queries.products.movements(id, query.limit);
  }
}
