import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { issueInvoiceSchema } from '@corebiz/contracts';
import { Money } from '@corebiz/domain';
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
@Controller('v1/invoicing/invoices')
export class IssueInvoiceController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('invoice:write')
  @ApiOperation({ summary: 'Emitir una factura fiscal con generacion contable de partida doble' })
  async run(
    @Body(new ZodValidationPipe(issueInvoiceSchema))
    body: z.infer<typeof issueInvoiceSchema>,
  ) {
    const lines = body.lines.map((l) => {
      const unitPriceParsed = Money.of(l.unitPrice, body.currency);
      return {
        id: crypto.randomUUID(),
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: unitPriceParsed.ok ? unitPriceParsed.value.minorUnits : 0n,
        taxPercentage: l.taxPercentage,
        productId: l.productId,
        revenueAccountId: l.revenueAccountId,
      };
    });

    const result = await this.useCases.issueInvoice.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      customerId: body.customerId,
      documentType: body.documentType,
      documentNumber: body.documentNumber,
      controlNumber: body.controlNumber,
      issueDate: body.issueDate,
      dueDate: body.dueDate,
      currency: body.currency,
      receivableAccountId: body.receivableAccountId ?? body.cashAccountId ?? '',
      revenueAccountId: body.revenueAccountId,
      taxPayableAccountId: body.taxPayableAccountId,
      paymentCondition: body.paymentCondition,
      cashAccountId: body.cashAccountId,
      creditDays: body.creditDays,
      lines,
    });

    const val = unwrapOrThrow(result);
    return {
      invoiceId: val.invoiceId,
      journalEntryId: val.journalEntryId,
    };
  }
}
