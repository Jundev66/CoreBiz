import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { voidCollectionReceiptSchema } from '@corebiz/contracts';
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
export class VoidCollectionReceiptController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post(':id/void')
  @RequirePermission('invoice:write')
  @ApiOperation({ summary: 'Anular un recibo de cobro revirtiendo asientos y saldos' })
  async run(
    @Param('id') receiptId: string,
    @Body(new ZodValidationPipe(voidCollectionReceiptSchema))
    body: z.infer<typeof voidCollectionReceiptSchema>,
  ) {
    const result = await this.useCases.voidCollectionReceipt.execute({
      tenantId: this.ctx.tenantId,
      receiptId,
      reason: body.reason,
      bankAccountId: 'acc-cash-usd-01',
      receivableAccountId: 'acc-ar-usd-02',
      voidedAt: new Date(),
    });

    const val = unwrapOrThrow(result);
    return {
      receiptId: val.receiptId,
      journalEntryId: val.journalEntryId,
    };
  }
}
