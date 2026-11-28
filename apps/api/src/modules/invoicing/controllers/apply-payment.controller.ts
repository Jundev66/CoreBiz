import { Body, Controller, Inject, Optional, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { applyInvoicePaymentSchema } from '@corebiz/contracts';
import { Money, type Currency } from '@corebiz/domain';
import { convertMinorUnits, scaleExchangeRate } from '@corebiz/infrastructure';
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
export class ApplyPaymentController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
    @Optional() @Inject(RUNTIME) private readonly runtime?: Runtime,
  ) {}

  @Post(':id/payments')
  @RequirePermission('invoice:write')
  @ApiOperation({ summary: 'Registrar un pago o cobro contra una factura viva' })
  async run(
    @Param('id') invoiceId: string,
    @Body(new ZodValidationPipe(applyInvoicePaymentSchema))
    body: z.infer<typeof applyInvoicePaymentSchema>,
  ) {
    const invoice = await this.runtime?.invoices.findById(this.ctx.tenantId, invoiceId);
    const documentCurrency: Currency = invoice?.total.currency ?? body.currency;
    const amountParsed = Money.of(body.amount, body.currency);
    const paymentAmountMinor = amountParsed.ok ? amountParsed.value.minorUnits : 0n;
    const exchangeRateScaled = scaleExchangeRate(body.exchangeRate ?? body.paymentExchangeRate);
    const appliedAmountMinor = convertMinorUnits(
      paymentAmountMinor,
      body.currency,
      documentCurrency,
      exchangeRateScaled,
    );

    const issueExchangeRate = body.issueExchangeRate
      ? Number.parseFloat(body.issueExchangeRate.replace(',', '.'))
      : undefined;
    const paymentExchangeRate = body.paymentExchangeRate
      ? Number.parseFloat(body.paymentExchangeRate.replace(',', '.'))
      : body.exchangeRate
        ? Number.parseFloat(body.exchangeRate.replace(',', '.'))
        : undefined;

    const result = await this.useCases.applyInvoicePayment.execute({
      tenantId: this.ctx.tenantId,
      invoiceId,
      amountMinor: appliedAmountMinor,
      currency: documentCurrency,
      paymentDate: body.paymentDate,
      cashAccountId: body.cashAccountId,
      receivableAccountId: body.receivableAccountId,
      reference: body.reference,
      issueExchangeRate:
        issueExchangeRate !== undefined && Number.isFinite(issueExchangeRate)
          ? issueExchangeRate
          : undefined,
      paymentExchangeRate:
        paymentExchangeRate !== undefined && Number.isFinite(paymentExchangeRate)
          ? paymentExchangeRate
          : undefined,
      fxGainLossAccountId: body.fxGainLossAccountId,
    });

    const val = unwrapOrThrow(result);

    const recorded = this.runtime
      ? await this.runtime.documentPayments.recordPayment({
          direction: 'INBOUND',
          documentType: 'INVOICE',
          documentId: invoiceId,
          installmentId: body.installmentId,
          paymentMethod: body.paymentMethod ?? (body.currency === 'VES' ? 'MOBILE_PAY' : 'ZELLE'),
          paymentCurrency: body.currency,
          paymentAmountMinor,
          documentCurrency,
          appliedAmountMinor,
          exchangeRateScaled,
          accountId: body.cashAccountId,
          journalEntryId: val.journalEntryId,
          paymentDate: body.paymentDate,
          reference: body.reference,
          notes: body.notes,
        })
      : null;

    return {
      invoiceId: val.invoiceId,
      ...(recorded ? { paymentId: recorded.id, paymentNumber: recorded.paymentNumber } : {}),
      remainingBalanceMinor: val.remainingBalanceMinor.toString(),
      fxDifferenceMinor: val.fxDifferenceMinor.toString(),
    };
  }
}
