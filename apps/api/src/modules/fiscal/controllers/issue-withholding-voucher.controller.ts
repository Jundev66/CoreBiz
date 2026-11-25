import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { issueWithholdingVoucherSchema } from '@corebiz/contracts';
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
@Controller('v1/fiscal/withholdings')
export class IssueWithholdingVoucherController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Emitir comprobante legal de retencion fiscal (IVA / ISLR)' })
  async run(
    @Body(new ZodValidationPipe(issueWithholdingVoucherSchema))
    body: z.infer<typeof issueWithholdingVoucherSchema>,
  ) {
    const result = await this.useCases.issueWithholdingVoucher.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      sourceDocumentId: body.sourceDocumentId,
      documentNumber: body.documentNumber,
      controlNumber: body.controlNumber,
      supplierTaxId: body.supplierTaxId,
      supplierName: body.supplierName,
      fiscalPeriod: body.fiscalPeriod,
      withholdingType: body.withholdingType,
      taxableBaseMinor: BigInt(body.taxableBaseMinor),
      taxAmountMinor: BigInt(body.taxAmountMinor),
      percentageBp: body.percentageBp,
      currency: body.currency,
    });

    const val = unwrapOrThrow(result);
    return {
      voucherId: val.voucherId,
      voucherNumber: val.voucherNumber,
      withheldAmountMinor: val.withheldAmountMinor,
      status: val.status,
    };
  }
}
