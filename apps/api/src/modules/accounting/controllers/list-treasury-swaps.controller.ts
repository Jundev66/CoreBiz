import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TreasurySwapResponseDto } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/treasury')
export class ListTreasurySwapsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get('swaps')
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Listar operaciones y swaps de tesorería del tenant' })
  async list(): Promise<readonly TreasurySwapResponseDto[]> {
    const list = await this.useCases.listTreasurySwaps.execute(this.ctx.tenantId);

    return list.map((swap) => ({
      id: swap.id,
      tenantId: swap.tenantId,
      swapNumber: swap.swapNumber.toString(),
      date: swap.date.toISOString(),
      sourceAccountId: swap.sourceAccountId,
      sourceCurrency: swap.sourceCurrency,
      sourceAmount: swap.sourceAmount.toString(),
      targetAccountId: swap.targetAccountId,
      targetCurrency: swap.targetCurrency,
      targetAmount: swap.targetAmount.toString(),
      feeAccountId: swap.feeAccountId,
      feeAmount: swap.feeAmount.toString(),
      exchangeRate: (Number(swap.exchangeRateScaled) / 100_000_000).toFixed(4),
      counterpartyReference: swap.counterpartyReference,
      operatorUserId: swap.operatorUserId,
      description: swap.description,
      journalEntryId: swap.journalEntryId,
      status: swap.status,
      createdAt: swap.createdAt.toISOString(),
    }));
  }
}
