import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SupplierDetail } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class GetSupplierByIdController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('suppliers/:id')
  @RequirePermission('supplier:read')
  @ApiOperation({ summary: 'Ficha completa de un proveedor' })
  async run(@Param('id') id: string): Promise<SupplierDetail> {
    const supplier = await this.runtime.queries.purchasing.supplierById(id);
    if (supplier === null) {
      throw new NotFoundException({ errorKind: 'SupplierNotFound', errorParams: { id } });
    }
    return supplier;
  }
}
