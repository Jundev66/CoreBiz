import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CustomerDetail } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/customers')
export class GetCustomerByIdController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get(':id')
  @RequirePermission('customer:read')
  @ApiOperation({ summary: 'Ficha completa' })
  async run(@Param('id') id: string): Promise<CustomerDetail> {
    const customer = await this.runtime.queries.customers.byId(id);
    if (customer === null) {
      throw new NotFoundException({ errorKind: 'CustomerNotFound', errorParams: { id } });
    }
    return customer;
  }
}
