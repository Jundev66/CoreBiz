import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { createInventoryAuditSchema } from '@corebiz/contracts';
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
export class CreateInventoryAuditController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Crear una orden de toma fisica de inventario (OPEN)' })
  async run(
    @Body(new ZodValidationPipe(createInventoryAuditSchema))
    body: z.infer<typeof createInventoryAuditSchema>,
  ) {
    const result = await this.useCases.createInventoryAudit.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      warehouseId: body.warehouseId,
      blindCount: body.blindCount,
      notes: body.notes,
      lines: body.lines,
    });

    const val = unwrapOrThrow(result);
    return {
      auditId: val.auditId,
      auditNumber: val.auditNumber,
      status: val.status,
    };
  }
}
