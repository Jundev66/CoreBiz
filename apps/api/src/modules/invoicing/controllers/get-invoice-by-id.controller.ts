import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME, TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('facturacion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/invoicing/invoices')
export class GetInvoiceByIdController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
    @Optional() @Inject(RUNTIME) private readonly runtime?: Runtime,
  ) {}

  @Get(':id')
  @RequirePermission('invoice:read')
  @ApiOperation({ summary: 'Obtener detalle completo de una factura de venta' })
  async run(@Param('id') id: string) {
    const result = await this.useCases.getInvoiceById.execute({
      tenantId: this.ctx.tenantId,
      invoiceId: id,
    });

    if (!result.ok) {
      throw new NotFoundException({ errorKind: 'InvoiceNotFound', errorParams: { id } });
    }

    const [installments, payments] = this.runtime
      ? await Promise.all([
          this.runtime.documentPayments.listInstallments('INVOICE', id).catch(() => []),
          this.runtime.documentPayments.listPaymentsByDocument('INVOICE', id).catch(() => []),
        ])
      : [[], []];

    const inv = result.value;
    return {
      ...inv,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate.toISOString(),
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
