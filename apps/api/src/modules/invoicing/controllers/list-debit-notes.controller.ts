import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { listDebitNotesQuerySchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('facturacion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/invoicing/debit-notes')
export class ListDebitNotesController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('invoice:read')
  @ApiOperation({ summary: 'Listar notas de debito' })
  async run(
    @Query(new ZodValidationPipe(listDebitNotesQuerySchema))
    query: z.infer<typeof listDebitNotesQuerySchema>,
  ) {
    const notes = await this.useCases.listDebitNotes.execute({
      tenantId: this.ctx.tenantId,
      filter: query,
    });

    return notes.map((n) => ({
      id: n.id,
      debitNoteNumber: n.debitNoteNumber,
      controlNumber: n.controlNumber ?? null,
      affectedInvoiceId: n.affectedInvoiceId,
      affectedDocumentNumber: n.affectedDocumentNumber,
      customerId: n.customerId,
      reason: n.reason,
      reasonDetails: n.reasonDetails ?? null,
      issueDate: n.issueDate.toISOString(),
      currency: n.total.currency,
      subtotalMinor: n.subtotal.minorUnits.toString(),
      taxTotalMinor: n.taxTotal.minorUnits.toString(),
      totalMinor: n.total.minorUnits.toString(),
      lines: n.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity.toString(),
        unitPriceMinor: l.unitPrice.minorUnits.toString(),
        taxPercentage: l.taxRate.percentage,
        taxAmountMinor: l.taxAmount.minorUnits.toString(),
        totalMinor: l.total.minorUnits.toString(),
      })),
    }));
  }
}
