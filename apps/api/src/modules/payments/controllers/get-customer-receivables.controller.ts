import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CustomerReceivableItem } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('cobros')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/payments')
export class GetCustomerReceivablesController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('receivables/:customerId')
  @RequirePermission('payment:read')
  @ApiOperation({ summary: 'Notas con saldo pendiente por cobrar para un cliente' })
  run(@Param('customerId') customerId: string): Promise<readonly CustomerReceivableItem[]> {
    return this.runtime.queries.payments.customerReceivables(customerId);
  }
}
