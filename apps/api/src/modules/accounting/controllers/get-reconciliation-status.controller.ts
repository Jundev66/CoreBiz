import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/bank-statements')
export class GetReconciliationStatusController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get(':id/status')
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Obtener estado y resumen de conciliación bancaria' })
  @ApiParam({ name: 'id', description: 'ID del estado de cuenta' })
  async run(@Param('id') id: string) {
    const result = await this.useCases.getReconciliationStatus.execute({
      tenantId: this.ctx.tenantId,
      statementId: id,
    });

    const val = unwrapOrThrow(result);
    return {
      statement: {
        id: val.statement.id,
        bankAccountId: val.statement.bankAccountId,
        currency: val.statement.currency,
        startDate: val.statement.startDate.toISOString(),
        endDate: val.statement.endDate.toISOString(),
        startingBalance: val.statement.startingBalance.toString(),
        endingBalance: val.statement.endingBalance.toString(),
        status: val.statement.status,
        lines: val.statement.lines.map((l) => ({
          id: l.id,
          lineType: l.lineType,
          amount: l.amount.toString(),
          transactionDate: l.transactionDate.toISOString(),
          reference: l.reference,
          description: l.description,
          status: l.status,
          matchedJournalEntryId: l.matchedJournalEntryId ?? null,
        })),
      },
      bankEndingBalance: val.bankEndingBalance.toString(),
      bookBalance: val.bookBalance.toString(),
      reconciledBalance: val.reconciledBalance.toString(),
      unreconciledDifference: val.unreconciledDifference.toString(),
      totalLinesCount: val.totalLinesCount,
      matchedLinesCount: val.matchedLinesCount,
      unmatchedLinesCount: val.unmatchedLinesCount,
      isFullyReconciled: val.isFullyReconciled,
    };
  }
}
