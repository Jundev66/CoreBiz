import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import type { Page, PaymentListItem } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { paymentListQuerySchema, withoutUndefined } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('cobros')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/payments')
export class ListCustomerPaymentsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get()
  @RequirePermission('payment:read')
  @ApiOperation({ summary: 'Listado de cobros y recibos' })
  run(
    @Query(new ZodValidationPipe(paymentListQuerySchema))
    query: z.infer<typeof paymentListQuerySchema>,
  ): Promise<Page<PaymentListItem>> {
    return this.runtime.queries.payments.list(withoutUndefined(query));
  }
}
