import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

const FINAL_CONSUMER = {
  id: '10000000-0000-4000-8000-000000000000',
  code: 'CF-0000',
  name: 'Consumidor Final',
  taxId: 'V-00000000',
  email: null,
  phone: null,
};

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class GetPosCustomersController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('customers')
  @RequirePermission('customer:read')
  @ApiOperation({ summary: 'Descargar clientes del tenant para terminal POS' })
  async run() {
    const page = await this.runtime.queries.customers.list({ limit: 500 });
    const items = page.items.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      taxId: c.taxId ?? 'N/A',
      email: null,
      phone: null,
    }));

    const hasConsumidorFinal = items.some(
      (c) => c.code === FINAL_CONSUMER.code || c.id === FINAL_CONSUMER.id,
    );

    return {
      items: hasConsumidorFinal ? items : [FINAL_CONSUMER, ...items],
    };
  }
}
