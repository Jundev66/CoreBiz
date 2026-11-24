import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { listInvoicesQuerySchema } from '@corebiz/contracts';
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
export class ListInvoicesController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('invoice:read')
  @ApiOperation({ summary: 'Listar facturas emitidas del tenant' })
  async run(
    @Query(new ZodValidationPipe(listInvoicesQuerySchema))
    _query: z.infer<typeof listInvoicesQuerySchema>,
  ) {
    const result = await this.useCases.listInvoices.execute({
      tenantId: this.ctx.tenantId,
    });

    const invoices = unwrapOrThrow(result);
    return {
      invoices: invoices.map((inv) => ({
        id: inv.id,
        documentType: inv.documentType,
        documentNumber: inv.documentNumber,
        controlNumber: inv.controlNumber ?? null,
        customerId: inv.customerId,
        issueDate: inv.issueDate.toISOString(),
        dueDate: inv.dueDate.toISOString(),
        currency: inv.currency,
        subtotalMinor: inv.subtotalMinor,
        taxMinor: inv.taxMinor,
        igtfMinor: inv.igtfMinor,
        totalMinor: inv.totalMinor,
        paidMinor: inv.paidMinor,
        status: inv.status,
      })),
    };
  }
}
