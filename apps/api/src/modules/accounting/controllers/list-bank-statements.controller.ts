import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/bank-statements')
export class ListBankStatementsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Listar estados de cuenta bancarios de la empresa' })
  @ApiQuery({ name: 'bankAccountId', required: false, description: 'Filtrar por cuenta bancaria' })
  async run(@Query('bankAccountId') bankAccountId?: string) {
    const statements = await this.useCases.listBankStatements.execute({
      tenantId: this.ctx.tenantId,
      bankAccountId,
    });

    return {
      statements: statements.map((s) => ({
        id: s.id,
        bankAccountId: s.bankAccountId,
        currency: s.currency,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        startingBalance: s.startingBalance.toString(),
        endingBalance: s.endingBalance.toString(),
        status: s.status,
        linesCount: s.lines.length,
        unmatchedCount: s.calculateUnmatchedLines().length,
      })),
    };
  }
}
