import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { executeTreasurySwapSchema, type TreasurySwapResponseDto } from '@corebiz/contracts';
import { Money, parseDecimalToMinor, RATE_SCALE } from '@corebiz/shared-kernel';
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
@Controller('v1/accounting/treasury')
export class ExecuteTreasurySwapController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post('swaps')
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Ejecutar swap de tesorería y compra de activos/divisas' })
  async run(
    @Body(new ZodValidationPipe(executeTreasurySwapSchema))
    body: z.infer<typeof executeTreasurySwapSchema>,
  ): Promise<TreasurySwapResponseDto> {
    const swapId = randomUUID();

    const parsedSourceAmount = Money.of(body.sourceAmount, body.sourceCurrency);
    const parsedTargetAmount = Money.of(body.targetAmount, body.targetCurrency);
    const parsedFeeAmount = Money.of(body.feeAmount ?? '0', body.targetCurrency);
    const parsedRate = parseDecimalToMinor(body.exchangeRate, RATE_SCALE);

    const sourceAmountMinor = parsedSourceAmount.ok ? parsedSourceAmount.value.minorUnits : 0n;
    const targetAmountMinor = parsedTargetAmount.ok ? parsedTargetAmount.value.minorUnits : 0n;
    const feeAmountMinor = parsedFeeAmount.ok ? parsedFeeAmount.value.minorUnits : 0n;
    const exchangeRateScaled = parsedRate.ok ? parsedRate.value : 0n;

    const result = await this.useCases.executeTreasurySwap.execute({
      id: swapId,
      tenantId: this.ctx.tenantId,
      date: body.date,
      sourceAccountId: body.sourceAccountId,
      sourceCurrency: body.sourceCurrency,
      sourceAmountMinor,
      targetAccountId: body.targetAccountId,
      targetCurrency: body.targetCurrency,
      targetAmountMinor,
      feeAccountId: body.feeAccountId,
      feeAmountMinor,
      exchangeRateScaled,
      counterpartyReference: body.counterpartyReference,
      operatorUserId: this.ctx.actor.userId,
      description: body.description,
      validateAvailableBalance: true,
    });

    const val = unwrapOrThrow(result);
    const swap = val.swap;

    return {
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
    };
  }
}
