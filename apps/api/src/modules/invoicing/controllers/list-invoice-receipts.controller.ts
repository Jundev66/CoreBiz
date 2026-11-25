import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('facturacion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/invoicing/invoices')
export class ListInvoiceReceiptsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get(':id/receipts')
  @RequirePermission('invoice:read')
  @ApiOperation({ summary: 'Listar recibos y trazabilidad de cobros de una factura' })
  async run(@Param('id') invoiceId: string) {
    const receipts = await this.useCases.listInvoiceReceipts.execute({
      tenantId: this.ctx.tenantId,
      invoiceId,
    });

    return receipts.map((r) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      customerId: r.customerId,
      amount: r.amount.toString(),
      currency: r.amount.currency,
      paymentMethod: r.paymentMethod,
      bankAccountId: r.bankAccountId,
      receiptDate: r.receiptDate.toISOString(),
      reference: r.reference ?? null,
      status: r.status,
      notes: r.notes ?? null,
      allocations: r.allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amount: a.amount.toString(),
        previousBalance: a.previousBalance.toString(),
        newBalance: a.newBalance.toString(),
      })),
    }));
  }
}
