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
@Controller('v1/fiscal/reports/purchases-book')
export class GetPurchasesBookController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Generar Libro Especial de Compras reglamentario SENIAT' })
  async run(
    @Query(new ZodValidationPipe(fiscalReportQuerySchema))
    query: z.infer<typeof fiscalReportQuerySchema>,
  ) {
    const result = await this.useCases.generatePurchasesBook.execute({
      tenantId: this.ctx.tenantId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const val = unwrapOrThrow(result);
    return {
      records: val.records.map((r) => ({
        operationNumber: r.operationNumber,
        receiptDate: r.receiptDate.toISOString(),
        supplierTaxId: r.supplierTaxId,
        supplierName: r.supplierName,
        documentNumber: r.documentNumber,
        controlNumber: r.controlNumber ?? null,
        affectedDocumentNumber: r.affectedDocumentNumber ?? null,
        documentType: r.documentType,
        totalPurchasesMinor: r.totalPurchasesMinor.toString(),
        exemptPurchasesMinor: r.exemptPurchasesMinor.toString(),
        taxableBaseGeneralMinor: r.taxableBaseGeneralMinor.toString(),
        taxGeneralMinor: r.taxGeneralMinor.toString(),
        taxGeneralPercentage: r.taxGeneralPercentage,
        vatWithheldMinor: r.vatWithheldMinor.toString(),
        withholdingVoucherNumber: r.withholdingVoucherNumber ?? null,
        currency: r.currency,
      })),
      totalPurchasesMinor: val.totalPurchasesMinor.toString(),
      totalExemptMinor: val.totalExemptMinor.toString(),
      totalTaxableBaseMinor: val.totalTaxableBaseMinor.toString(),
      totalTaxCreditMinor: val.totalTaxCreditMinor.toString(),
      totalWithheldMinor: val.totalWithheldMinor.toString(),
      currency: val.currency,
    };
  }
}
