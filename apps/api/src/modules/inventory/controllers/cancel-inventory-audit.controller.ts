import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { cancelInventoryAuditSchema } from '@corebiz/contracts';
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
export class CancelInventoryAuditController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post(':id/cancel')
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Cancelar toma fisica de inventario con motivo' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInventoryAuditSchema))
    body: z.infer<typeof cancelInventoryAuditSchema>,
  ) {
    const result = await this.useCases.cancelInventoryAudit.execute({
      tenantId: this.ctx.tenantId,
      auditId: id,
      reason: body.reason,
    });

    const val = unwrapOrThrow(result);
    return {
      auditId: val.auditId,
      auditNumber: val.auditNumber,
      status: val.status,
    };
  }
}
