import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
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
export class GetInvoiceByIdController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
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

    const inv = result.value;
    return {
      ...inv,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate.toISOString(),
    };
  }
}
