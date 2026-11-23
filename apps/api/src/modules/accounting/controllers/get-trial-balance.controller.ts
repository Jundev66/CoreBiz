import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { getTrialBalanceQuerySchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/trial-balance')
export class GetTrialBalanceController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Consultar el balance de comprobacion' })
  async run(
    @Query(new ZodValidationPipe(getTrialBalanceQuerySchema))
    query: z.infer<typeof getTrialBalanceQuerySchema>,
  ) {
    const result = await this.useCases.getTrialBalance.execute({
      tenantId: this.ctx.tenantId,
      startDate: query.startDate,
      endDate: query.endDate,
      currency: query.currency,
    });

    const val = unwrapOrThrow(result);
    return {
      accounts: val.accounts.map((acc) => ({
        accountId: acc.accountId,
        code: acc.code,
        name: acc.name,
        normalSide: acc.normalSide,
        totalDebitMinor: acc.totalDebitMinor.toString(),
        totalCreditMinor: acc.totalCreditMinor.toString(),
        netBalanceMinor: acc.netBalanceMinor.toString(),
      })),
      totalDebitMinor: val.totalDebitMinor.toString(),
      totalCreditMinor: val.totalCreditMinor.toString(),
      isBalanced: val.isBalanced,
    };
  }
}
