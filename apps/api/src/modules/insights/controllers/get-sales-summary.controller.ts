import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SalesReport } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('reportes')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1')
export class GetSalesSummaryController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('reports/sales-summary')
  @RequirePermission('report:read')
  @RequireFeature('reports')
  @ApiOperation({ summary: 'Resumen de ventas del periodo' })
  run(): Promise<SalesReport> {
    return this.runtime.queries.reports.salesSummary();
  }
}
