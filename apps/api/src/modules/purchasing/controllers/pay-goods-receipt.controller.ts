import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { payGoodsReceiptSchema } from '@corebiz/contracts';
import { Money } from '@corebiz/domain';
import { convertMinorUnits, scaleExchangeRate } from '@corebiz/infrastructure';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME, TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class PayGoodsReceiptController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Optional() @Inject(RUNTIME) private readonly runtime?: Runtime,
    @Optional() @Inject(TENANT_CONTEXT) private readonly ctx?: TenantContext,
  ) {}

  @Post('receipts/:id/payments')
  @RequirePermission('purchase:receive')
  @ApiOperation({
    summary: 'Registrar pago parcial o total a proveedor desde una cuenta de activo',
  })
  async run(
    @Param('id') receiptId: string,
    @Body(new ZodValidationPipe(payGoodsReceiptSchema))
    body: z.infer<typeof payGoodsReceiptSchema>,
  ) {
    const entries =
      this.runtime && this.ctx
        ? await this.runtime.journalEntries
            .listByDateRange(
              this.ctx.tenantId,
              new Date(0),
              new Date(Date.now() + 365 * 86_400_000),
            )
            .catch(() => [])
        : [];
    const purchaseEntry = entries.find(
      (e) => e.sourceId === receiptId && e.sourceType === 'PURCHASE',
    );
    const documentCurrency = purchaseEntry?.lines[0]?.debit.currency ?? body.currency;

    const parsed = Money.of(body.amount, body.currency);
    const paymentAmountMinor = parsed.ok ? parsed.value.minorUnits : 0n;
    const exchangeRateScaled = scaleExchangeRate(body.exchangeRate);
    const appliedAmountMinor = convertMinorUnits(
      paymentAmountMinor,
      body.currency,
      documentCurrency,
      exchangeRateScaled,
    );

    const result = await this.useCases.payGoodsReceipt({
      receiptId,
      amountMinor: appliedAmountMinor,
      currency: documentCurrency,
      paymentDate: body.paymentDate,
      sourceAccountId: body.sourceAccountId,
      ...(body.payableAccountId ? { payableAccountId: body.payableAccountId } : {}),
      ...(body.reference ? { reference: body.reference } : {}),
    });

    if (!result.ok) {
      if (result.error.kind === 'GoodsReceiptNotFound') {
        throw new NotFoundException({
          errorKind: result.error.kind,
          errorParams: { id: receiptId },
        });
      }
      throw new BadRequestException({ errorKind: result.error.kind });
    }

    const recorded = this.runtime
      ? await this.runtime.documentPayments.recordPayment({
          direction: 'OUTBOUND',
          documentType: 'PURCHASE',
          documentId: receiptId,
          installmentId: body.installmentId,
          paymentMethod:
            body.paymentMethod ?? (body.currency === 'VES' ? 'BANK_TRANSFER' : 'ZELLE'),
          paymentCurrency: body.currency,
          paymentAmountMinor,
          documentCurrency,
          appliedAmountMinor,
          exchangeRateScaled,
          accountId: body.sourceAccountId,
          journalEntryId: result.value.journalEntryId,
          paymentDate: body.paymentDate,
          reference: body.reference || undefined,
          notes: body.notes || undefined,
        })
      : null;

    return {
      ...result.value,
      ...(recorded ? { paymentId: recorded.id, paymentNumber: recorded.paymentNumber } : {}),
    };
  }
}
