import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { createWarehouseSchema } from '@corebiz/contracts';
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
@Controller('v1/inventory/warehouses')
export class CreateWarehouseController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('settings:write')
  @ApiOperation({ summary: 'Registrar un nuevo almacen o deposito fisico' })
  async run(
    @Body(new ZodValidationPipe(createWarehouseSchema))
    body: z.infer<typeof createWarehouseSchema>,
  ) {
    const result = await this.useCases.createWarehouse.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      code: body.code,
      name: body.name,
      isDefault: body.isDefault,
      address: body.address,
    });

    const val = unwrapOrThrow(result);
    return {
      warehouseId: val.warehouseId,
    };
  }
}
