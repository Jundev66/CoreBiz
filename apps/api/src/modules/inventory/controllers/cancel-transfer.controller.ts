import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { cancelTransferSchema } from '@corebiz/contracts';
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
export class CancelTransferController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post(':id/cancel')
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Cancelar un traslado restituyendo el stock al deposito origen' })
  async run(
    @Param('id') transferId: string,
    @Body(new ZodValidationPipe(cancelTransferSchema))
    body: z.infer<typeof cancelTransferSchema>,
  ) {
    const result = await this.useCases.cancelTransfer.execute({
      tenantId: this.ctx.tenantId,
      transferId,
      reason: body.reason,
    });

    const val = unwrapOrThrow(result);
    return {
      transferId: val.transferId,
      status: val.status,
    };
  }
}
