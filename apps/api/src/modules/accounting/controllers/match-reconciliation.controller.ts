import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { matchReconciliationSchema } from '@corebiz/contracts';
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
@Controller('v1/accounting/bank-statements')
export class MatchReconciliationController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post(':id/match')
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Emparejar movimientos bancarios con asientos contables' })
  @ApiParam({ name: 'id', description: 'ID del estado de cuenta' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(matchReconciliationSchema))
    body: z.infer<typeof matchReconciliationSchema>,
  ): Promise<{ statementId: string; matchedCount: number }> {
    const result = await this.useCases.matchReconciliation.execute({
      tenantId: this.ctx.tenantId,
      statementId: id,
      matches: body.matches,
    });

    const val = unwrapOrThrow(result);
    return {
      statementId: val.statementId,
      matchedCount: val.matchedCount,
    };
  }
}
