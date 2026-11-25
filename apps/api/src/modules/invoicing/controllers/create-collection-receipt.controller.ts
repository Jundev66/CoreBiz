import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { createCollectionReceiptSchema } from '@corebiz/contracts';
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
@Controller('v1/invoicing/receipts')
export class CreateCollectionReceiptController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('invoice:write')
  @ApiOperation({ summary: 'Registrar un recibo de cobro con trazabilidad y generacion contable' })
  async run(
    @Body(new ZodValidationPipe(createCollectionReceiptSchema))
    body: z.infer<typeof createCollectionReceiptSchema>,
  ) {
    const amountParsed = Money.of(body.amount, body.currency);
    const amountMinor = amountParsed.ok ? amountParsed.value.minorUnits : 0n;

    const allocations = body.allocations.map((a) => {
      const allocParsed = Money.of(a.amount, body.currency);
      return {
        invoiceId: a.invoiceId,
        amountMinor: allocParsed.ok ? allocParsed.value.minorUnits : 0n,
      };
    });

    const result = await this.useCases.createCollectionReceipt.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      customerId: body.customerId,
      amountMinor,
      currency: body.currency,
      paymentMethod: body.paymentMethod,
      bankAccountId: body.bankAccountId,
      receivableAccountId: body.bankAccountId,
      receiptDate: body.receiptDate,
      reference: body.reference,
      notes: body.notes,
      allocations,
    });

    const val = unwrapOrThrow(result);
    return {
      receiptId: val.receiptId,
      receiptNumber: val.receiptNumber,
      journalEntryId: val.journalEntryId,
    };
  }
}
