import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { initiateTransferSchema } from '@corebiz/contracts';
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
@Controller('v1/inventory/transfers')
export class InitiateTransferController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Iniciar un traslado de mercancia entre depositos (IN_TRANSIT)' })
  async run(
    @Body(new ZodValidationPipe(initiateTransferSchema))
    body: z.infer<typeof initiateTransferSchema>,
  ) {
    const result = await this.useCases.initiateTransfer.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      sourceWarehouseId: body.sourceWarehouseId,
      destinationWarehouseId: body.destinationWarehouseId,
      notes: body.notes,
      lines: body.lines,
    });

    const val = unwrapOrThrow(result);
    return {
      transferId: val.transferId,
      transferNumber: val.transferNumber,
      status: val.status,
    };
  }
}
