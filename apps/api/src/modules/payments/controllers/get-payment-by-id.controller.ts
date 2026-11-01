import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PaymentView } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('cobros')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/payments')
export class GetPaymentByIdController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get(':id')
  @RequirePermission('payment:read')
  @ApiOperation({ summary: 'Detalle de un cobro con sus imputaciones' })
  async run(@Param('id') id: string): Promise<PaymentView> {
    const payment = await this.runtime.queries.payments.byId(id);
    if (payment === null) {
      throw new NotFoundException({ errorKind: 'PaymentNotFound', errorParams: { id } });
    }
    return payment;
  }
}
