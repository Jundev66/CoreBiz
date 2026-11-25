import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { approveInventoryAuditSchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('inventario')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/inventory/audits')
export class ApproveInventoryAuditController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post(':id/approve')
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Aprobar toma fisica, ajustar stock y generar asiento contable' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveInventoryAuditSchema))
    body: z.infer<typeof approveInventoryAuditSchema>,
  ) {
    const result = await this.useCases.approveInventoryAudit.execute({
      tenantId: this.ctx.tenantId,
      auditId: id,
      notes: body.notes,
      shrinkageExpenseAccountId: body.shrinkageExpenseAccountId,
      inventoryAssetAccountId: body.inventoryAssetAccountId,
      surplusIncomeAccountId: body.surplusIncomeAccountId,
    });

    const val = unwrapOrThrow(result);
    return {
      auditId: val.auditId,
      auditNumber: val.auditNumber,
      status: val.status,
      journalEntryId: val.journalEntryId ?? null,
    };
  }
}
