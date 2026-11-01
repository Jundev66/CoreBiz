import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import type { Page, ProductListItem } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { productListQuerySchema, withoutUndefined } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('catalogo')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/products')
export class ListProductsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get()
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Listado del catalogo' })
  run(
    @Query(new ZodValidationPipe(productListQuerySchema))
    query: z.infer<typeof productListQuerySchema>,
  ): Promise<Page<ProductListItem>> {
    return this.runtime.queries.products.list(withoutUndefined(query));
  }
}
