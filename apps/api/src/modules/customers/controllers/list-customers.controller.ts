import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import type { CustomerListItem, Page } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { customerListQuerySchema, withoutUndefined } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/customers')
export class ListCustomersController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get()
  @RequirePermission('customer:read')
  @ApiOperation({ summary: 'Listado paginado por keyset' })
  run(
    @Query(new ZodValidationPipe(customerListQuerySchema))
    query: z.infer<typeof customerListQuerySchema>,
  ): Promise<Page<CustomerListItem>> {
    return this.runtime.queries.customers.list(withoutUndefined(query));
  }
}
