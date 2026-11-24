import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { fiscalReportQuerySchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('fiscal')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/fiscal/reports/us-tax-summary')
export class GetUsTaxSummaryController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({
    summary: 'Consultar resumen de liquidacion de Sales Tax por jurisdiccion (EE.UU.)',
  })
  async run(
    @Query(new ZodValidationPipe(fiscalReportQuerySchema))
    query: z.infer<typeof fiscalReportQuerySchema>,
  ) {
    const result = await this.useCases.generateUsTaxSummary.execute({
      tenantId: this.ctx.tenantId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const val = unwrapOrThrow(result);
    return {
      jurisdictions: val.jurisdictions.map((j) => ({
        stateCode: j.stateCode,
        jurisdictionName: j.jurisdictionName,
        grossSalesMinor: j.grossSalesMinor.toString(),
        exemptSalesMinor: j.exemptSalesMinor.toString(),
        taxableSalesMinor: j.taxableSalesMinor.toString(),
        taxRatePercentage: j.taxRatePercentage,
        taxCollectedMinor: j.taxCollectedMinor.toString(),
        currency: j.currency,
      })),
      totalGrossSalesMinor: val.totalGrossSalesMinor.toString(),
      totalExemptSalesMinor: val.totalExemptSalesMinor.toString(),
      totalTaxableSalesMinor: val.totalTaxableSalesMinor.toString(),
      totalTaxCollectedMinor: val.totalTaxCollectedMinor.toString(),
      currency: val.currency,
    };
  }
}
