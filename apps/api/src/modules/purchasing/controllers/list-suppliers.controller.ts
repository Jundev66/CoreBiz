import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import type { Page, SupplierListItem } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { supplierListQuerySchema, withoutUndefined } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class ListSuppliersController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('suppliers')
  @RequirePermission('supplier:read')
  @ApiOperation({ summary: 'Listado de proveedores' })
  run(
    @Query(new ZodValidationPipe(supplierListQuerySchema))
    query: z.infer<typeof supplierListQuerySchema>,
  ): Promise<Page<SupplierListItem>> {
    return this.runtime.queries.purchasing.suppliers(withoutUndefined(query));
  }
}
