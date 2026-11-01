import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import type { GoodsReceiptListItem, Page } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { receiptListQuerySchema, withoutUndefined } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class ListGoodsReceiptsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('receipts')
  @RequirePermission('purchase:read')
  @ApiOperation({ summary: 'Recepciones de mercancia' })
  run(
    @Query(new ZodValidationPipe(receiptListQuerySchema))
    query: z.infer<typeof receiptListQuerySchema>,
  ): Promise<Page<GoodsReceiptListItem>> {
    return this.runtime.queries.purchasing.receipts(withoutUndefined(query));
  }
}
