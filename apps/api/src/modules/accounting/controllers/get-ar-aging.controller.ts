import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { getArAgingQuerySchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/aging/ar')
export class GetArAgingController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Consultar reporte de antiguedad de cuentas por cobrar (AR Aging)' })
  async run(
    @Query(new ZodValidationPipe(getArAgingQuerySchema))
    query: z.infer<typeof getArAgingQuerySchema>,
  ) {
    return this.useCases.getArAgingReport.execute({
      tenantId: this.ctx.tenantId,
      asOfDate: query.asOfDate,
      customerId: query.customerId,
      currency: query.currency,
    });
  }
}
