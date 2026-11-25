import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { issueCreditNoteSchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('facturacion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/invoicing/credit-notes')
export class IssueCreditNoteController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('invoice:write')
  @ApiOperation({ summary: 'Emitir nota de credito fiscal contra una factura existente' })
  async run(
    @Body(new ZodValidationPipe(issueCreditNoteSchema))
    body: z.infer<typeof issueCreditNoteSchema>,
  ) {
    const lines = body.lines.map((l) => ({
      id: crypto.randomUUID(),
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: BigInt(Math.round(parseFloat(l.unitPrice) * 100)),
      taxPercentage: l.taxPercentage,
      productId: l.productId,
    }));

    const result = await this.useCases.issueCreditNote.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      affectedInvoiceId: body.affectedInvoiceId,
      creditNoteNumber: body.creditNoteNumber,
      controlNumber: body.controlNumber,
      reason: body.reason,
      reasonDetails: body.reasonDetails,
      issueDate: body.issueDate,
      restockItems: body.restockItems,
      warehouseId: body.warehouseId,
      lines,
    });

    const val = unwrapOrThrow(result);
    return {
      creditNoteId: val.creditNoteId,
      creditNoteNumber: val.creditNoteNumber,
      totalMinor: val.totalMinor,
    };
  }
}
