import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { listWithholdingVouchersQuerySchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('fiscal')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/fiscal/withholdings')
export class ListWithholdingVouchersController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Listar comprobantes legales de retencion fiscal' })
  async run(
    @Query(new ZodValidationPipe(listWithholdingVouchersQuerySchema))
    query: z.infer<typeof listWithholdingVouchersQuerySchema>,
  ) {
    const vouchers = await this.useCases.listWithholdingVouchers.execute({
      tenantId: this.ctx.tenantId,
      filter: query,
    });

    return vouchers.map((v) => ({
      id: v.id,
      voucherNumber: v.voucherNumber,
      fiscalPeriod: v.fiscalPeriod,
      withholdingType: v.withholdingType,
      sourceDocumentId: v.sourceDocumentId,
      documentNumber: v.documentNumber,
      controlNumber: v.controlNumber ?? null,
      supplierTaxId: v.supplierTaxId,
      supplierName: v.supplierName,
      taxableBaseMinor: v.taxableBase.minorUnits.toString(),
      taxAmountMinor: v.taxAmount.minorUnits.toString(),
      percentageBp: v.percentageBp,
      withheldAmountMinor: v.withheldAmount.minorUnits.toString(),
      currency: v.taxableBase.currency,
      status: v.status,
      issuedAt: v.issuedAt.toISOString(),
      declaredAt: v.declaredAt ? v.declaredAt.toISOString() : null,
      voidedAt: v.voidedAt ? v.voidedAt.toISOString() : null,
      voidReason: v.voidReason ?? null,
    }));
  }
}
