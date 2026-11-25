import { Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('inventario')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/inventory/transfers')
export class ReceiveTransferController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post(':id/receive')
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Confirmar recepcion fisica de traslado (COMPLETED)' })
  async run(@Param('id') transferId: string) {
    const result = await this.useCases.receiveTransfer.execute({
      tenantId: this.ctx.tenantId,
      transferId,
    });

    const val = unwrapOrThrow(result);
    return {
      transferId: val.transferId,
      status: val.status,
    };
  }
}
