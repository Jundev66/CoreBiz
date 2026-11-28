import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { GoodsReceiptView } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class GetGoodsReceiptByIdController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('receipts/:id')
  @RequirePermission('purchase:read')
  @ApiOperation({ summary: 'Una recepcion con su detalle' })
  async run(@Param('id') id: string): Promise<GoodsReceiptView & Record<string, unknown>> {
    const receipt = await this.runtime.queries.purchasing.receiptById(id);
    if (receipt === null) {
      throw new NotFoundException({ errorKind: 'GoodsReceiptNotFound', errorParams: { id } });
    }
    const [installments, payments] = await Promise.all([
      this.runtime.documentPayments.listInstallments('PURCHASE', id).catch(() => []),
      this.runtime.documentPayments.listPaymentsByDocument('PURCHASE', id).catch(() => []),
    ]);
    return {
      ...receipt,
      installments: installments.map((inst) => ({
        id: inst.id,
        installmentNumber: inst.installmentNumber,
        frequency: inst.frequency,
        dueDate: inst.dueDate.toISOString(),
        currency: inst.currency,
        amountMinor: inst.amountMinor.toString(),
        paidMinor: inst.paidMinor.toString(),
        status: inst.status,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        installmentId: p.installmentId,
        paymentMethod: p.paymentMethod,
        paymentCurrency: p.paymentCurrency,
        paymentAmountMinor: p.paymentAmountMinor.toString(),
        documentCurrency: p.documentCurrency,
        appliedAmountMinor: p.appliedAmountMinor.toString(),
        exchangeRateScaled: p.exchangeRateScaled.toString(),
        accountId: p.accountId,
        accountCode: p.accountCode,
        accountName: p.accountName,
        journalEntryId: p.journalEntryId,
        paymentDate: p.paymentDate.toISOString(),
        reference: p.reference,
        notes: p.notes,
      })),
    };
  }
}
