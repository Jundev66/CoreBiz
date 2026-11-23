import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { applyInvoicePaymentSchema } from '@corebiz/contracts';
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
export class ApplyPaymentController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post(':id/payments')
  @RequirePermission('invoice:write')
  @ApiOperation({ summary: 'Registrar un pago o cobro contra una factura viva' })
  async run(
    @Param('id') invoiceId: string,
    @Body(new ZodValidationPipe(applyInvoicePaymentSchema))
    body: z.infer<typeof applyInvoicePaymentSchema>,
  ) {
    const amountParsed = Money.of(body.amount, body.currency);
    const amountMinor = amountParsed.ok ? amountParsed.value.minorUnits : 0n;

    const result = await this.useCases.applyInvoicePayment.execute({
      tenantId: this.ctx.tenantId,
      invoiceId,
      amountMinor,
      currency: body.currency,
      paymentDate: body.paymentDate,
      cashAccountId: body.cashAccountId,
      receivableAccountId: body.receivableAccountId,
      reference: body.reference,
    });

    const val = unwrapOrThrow(result);
    return {
      invoiceId: val.invoiceId,
      remainingBalanceMinor: val.remainingBalanceMinor.toString(),
    };
  }
}
