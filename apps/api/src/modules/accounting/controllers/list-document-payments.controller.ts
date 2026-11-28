import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PaymentDirection } from '@corebiz/infrastructure';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/document-payments')
export class ListDocumentPaymentsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Listar cobros y pagos trazables de facturas y compras' })
  async run(@Query('direction') direction?: string) {
    const dir: PaymentDirection | undefined =
      direction === 'INBOUND' || direction === 'OUTBOUND' ? direction : undefined;
    const rows = await this.runtime.documentPayments.listPaymentsByDirection(dir, 150);
    return {
      payments: rows.map((p) => ({
        id: p.id,
        direction: p.direction,
        documentType: p.documentType,
        documentId: p.documentId,
        installmentId: p.installmentId,
        paymentNumber: p.paymentNumber,
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
        status: p.status,
      })),
    };
  }
}
