import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class GetPosConflictsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('conflicts')
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Listar inconsistencias y sobreventas de inventario' })
  async run() {
    return this.runtime.uow.run(async (repos) => {
      const conflicts = await repos.inventoryConflicts.list({ status: 'open' });
      return conflicts.map((c) => ({
        id: c.id,
        productId: c.productId,
        conflictType: c.conflictType,
        status: c.status,
        detectedAt: c.detectedAt.toISOString(),
        stockBefore: (Number(c.stockBefore) / 1000).toString(),
        quantityAttempted: (Number(c.quantityAttempted) / 1000).toString(),
        stockAfter: (Number(c.stockAfter) / 1000).toString(),
        shortageQuantity: (Number(c.shortageQuantity) / 1000).toString(),
        assignedTo: c.assignedTo,
        resolutionType: c.resolutionType,
        resolutionNotes: c.resolutionNotes,
      }));
    });
  }
}
