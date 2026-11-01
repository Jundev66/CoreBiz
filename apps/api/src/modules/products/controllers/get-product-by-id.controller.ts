import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ProductDetail } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('catalogo')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/products')
export class GetProductByIdController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get(':id')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Ficha del producto' })
  async run(@Param('id') id: string): Promise<ProductDetail> {
    const product = await this.runtime.queries.products.byId(id);
    if (product === null) {
      throw new NotFoundException({ errorKind: 'ProductNotFound', errorParams: { id } });
    }
    return product;
  }
}
