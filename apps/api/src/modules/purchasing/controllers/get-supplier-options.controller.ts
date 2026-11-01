import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import type { SupplierOption } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { optionsQuerySchema } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class GetSupplierOptionsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('suppliers/options')
  @RequirePermission('supplier:read')
  @ApiOperation({ summary: 'Lo justo para un desplegable' })
  run(
    @Query(new ZodValidationPipe(optionsQuerySchema)) query: z.infer<typeof optionsQuerySchema>,
  ): Promise<readonly SupplierOption[]> {
    return this.runtime.queries.purchasing.supplierOptions(query.limit);
  }
}
