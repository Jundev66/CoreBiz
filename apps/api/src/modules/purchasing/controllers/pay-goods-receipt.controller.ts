import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { payGoodsReceiptSchema } from '@corebiz/contracts';
import { Money } from '@corebiz/domain';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class PayGoodsReceiptController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

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
    const parsed = Money.of(body.amount, body.currency);
    const amountMinor = parsed.ok ? parsed.value.minorUnits : 0n;

    const result = await this.useCases.payGoodsReceipt({
      receiptId,
      amountMinor,
      currency: body.currency,
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

    return result.value;
  }
}
