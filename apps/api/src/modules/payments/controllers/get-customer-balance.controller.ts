import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('cobros')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/payments')
export class GetCustomerBalanceController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('balance/:customerId')
  @RequirePermission('payment:read')
  @ApiOperation({ summary: 'Saldo pendiente de un cliente' })
  async run(
    @Param('customerId') customerId: string,
    @Query('currency') currency?: 'USD' | 'VES',
  ): Promise<{ balance: string }> {
    const balance = await this.runtime.queries.payments.outstandingBalanceFor(
      customerId,
      currency ?? 'USD',
    );
    return { balance };
  }
}
