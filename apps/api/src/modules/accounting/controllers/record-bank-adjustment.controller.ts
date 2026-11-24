import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { recordBankAdjustmentSchema } from '@corebiz/contracts';
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
export class RecordBankAdjustmentController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post(':id/adjust')
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Registrar asiento de ajuste bancario para comisiones o intereses' })
  @ApiParam({ name: 'id', description: 'ID del estado de cuenta' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordBankAdjustmentSchema))
    body: z.infer<typeof recordBankAdjustmentSchema>,
  ): Promise<{ journalEntryId: string; entryNumber: string }> {
    const entryId = randomUUID();

    const result = await this.useCases.recordBankAdjustment.execute({
      id: entryId,
      tenantId: this.ctx.tenantId,
      statementId: id,
      statementLineId: body.statementLineId,
      counterpartAccountId: body.counterpartAccountId,
      description: body.description,
    });

    const val = unwrapOrThrow(result);
    return {
      journalEntryId: val.journalEntryId,
      entryNumber: val.entryNumber.toString(),
    };
  }
}
