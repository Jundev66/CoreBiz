import { Body, Controller, Inject, Optional, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { issueInvoiceSchema } from '@corebiz/contracts';
import { Money } from '@corebiz/domain';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME, TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';
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
    @Optional() @Inject(RUNTIME) private readonly runtime?: Runtime,
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
    await this.useCases.deductStockForInvoice?.({
      invoiceId: val.invoiceId,
      documentNumber: body.documentNumber,
      lines: body.lines,
    });

    const createdInvoice = await this.runtime?.invoices.findById(this.ctx.tenantId, val.invoiceId);
    const totalMinor = createdInvoice?.total.minorUnits ?? 0n;

    if (totalMinor > 0n && this.runtime) {
      if (body.paymentCondition === 'CREDIT') {
        await this.runtime.documentPayments.createInstallmentSchedule({
          documentType: 'INVOICE',
          documentId: val.invoiceId,
          frequency: body.installmentFrequency ?? 'SINGLE',
          count: body.installmentCount ?? 1,
          startDate: body.issueDate,
          creditDays: body.creditDays ?? 30,
          currency: body.currency,
          totalMinor,
        });
      } else {
        await this.runtime.documentPayments.recordPayment({
          direction: 'INBOUND',
          documentType: 'INVOICE',
          documentId: val.invoiceId,
          paymentMethod: body.paymentMethod ?? (body.currency === 'VES' ? 'CASH_VES' : 'CASH_USD'),
          paymentCurrency: body.currency,
          paymentAmountMinor: totalMinor,
          documentCurrency: body.currency,
          appliedAmountMinor: totalMinor,
          exchangeRateScaled: 100_000_000n,
          accountId: body.cashAccountId || body.receivableAccountId,
          journalEntryId: val.journalEntryId,
          paymentDate: body.issueDate,
          reference: body.documentNumber,
        });
      }
    }

    return {
      invoiceId: val.invoiceId,
      journalEntryId: val.journalEntryId,
    };
  }
}
