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
@Controller('v1/fiscal/reports/sales-book')
export class GetSalesBookController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Generar Libro Especial de Ventas reglamentario SENIAT' })
  async run(
    @Query(new ZodValidationPipe(fiscalReportQuerySchema))
    query: z.infer<typeof fiscalReportQuerySchema>,
  ) {
    const result = await this.useCases.generateSalesBook.execute({
      tenantId: this.ctx.tenantId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const val = unwrapOrThrow(result);
    return {
      records: val.records.map((r) => ({
        operationNumber: r.operationNumber,
        issueDate: r.issueDate.toISOString(),
        customerTaxId: r.customerTaxId,
        customerName: r.customerName,
        documentNumber: r.documentNumber,
        controlNumber: r.controlNumber ?? null,
        affectedDocumentNumber: r.affectedDocumentNumber ?? null,
        documentType: r.documentType,
        totalSalesMinor: r.totalSalesMinor.toString(),
        exemptSalesMinor: r.exemptSalesMinor.toString(),
        taxableBaseGeneralMinor: r.taxableBaseGeneralMinor.toString(),
        taxGeneralMinor: r.taxGeneralMinor.toString(),
        taxGeneralPercentage: r.taxGeneralPercentage,
        taxableBaseReducedMinor: r.taxableBaseReducedMinor.toString(),
        taxReducedMinor: r.taxReducedMinor.toString(),
        taxReducedPercentage: r.taxReducedPercentage,
        igtfMinor: r.igtfMinor.toString(),
        vatWithheldMinor: r.vatWithheldMinor.toString(),
        withholdingVoucherNumber: r.withholdingVoucherNumber ?? null,
        currency: r.currency,
      })),
      totalSalesMinor: val.totalSalesMinor.toString(),
      totalExemptMinor: val.totalExemptMinor.toString(),
      totalTaxableBaseMinor: val.totalTaxableBaseMinor.toString(),
      totalTaxDebitMinor: val.totalTaxDebitMinor.toString(),
      totalIgtfMinor: val.totalIgtfMinor.toString(),
      totalWithheldMinor: val.totalWithheldMinor.toString(),
      currency: val.currency,
    };
  }
}
