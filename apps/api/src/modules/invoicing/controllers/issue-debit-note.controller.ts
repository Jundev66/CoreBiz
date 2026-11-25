import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { issueDebitNoteSchema } from '@corebiz/contracts';
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
@Controller('v1/invoicing/debit-notes')
export class IssueDebitNoteController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('invoice:write')
  @ApiOperation({ summary: 'Emitir nota de debito fiscal contra una factura existente' })
  async run(
    @Body(new ZodValidationPipe(issueDebitNoteSchema))
    body: z.infer<typeof issueDebitNoteSchema>,
  ) {
    const lines = body.lines.map((l) => ({
      id: crypto.randomUUID(),
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: BigInt(Math.round(parseFloat(l.unitPrice) * 100)),
      taxPercentage: l.taxPercentage,
    }));

    const result = await this.useCases.issueDebitNote.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      affectedInvoiceId: body.affectedInvoiceId,
      debitNoteNumber: body.debitNoteNumber,
      controlNumber: body.controlNumber,
      reason: body.reason,
      reasonDetails: body.reasonDetails,
      issueDate: body.issueDate,
      revenueAccountId: body.revenueAccountId,
      lines,
    });

    const val = unwrapOrThrow(result);
    return {
      debitNoteId: val.debitNoteId,
      debitNoteNumber: val.debitNoteNumber,
      totalMinor: val.totalMinor,
    };
  }
}
