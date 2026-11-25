import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { getApAgingQuerySchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/aging/ap')
export class GetApAgingController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Consultar reporte de antiguedad de cuentas por pagar (AP Aging)' })
  async run(
    @Query(new ZodValidationPipe(getApAgingQuerySchema))
    query: z.infer<typeof getApAgingQuerySchema>,
  ) {
    return this.useCases.getApAgingReport.execute({
      tenantId: this.ctx.tenantId,
      asOfDate: query.asOfDate,
      supplierId: query.supplierId,
      currency: query.currency,
    });
  }
}
