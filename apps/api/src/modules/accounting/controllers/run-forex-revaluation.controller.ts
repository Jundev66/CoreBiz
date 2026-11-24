import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { runForexRevaluationSchema } from '@corebiz/contracts';
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
@Controller('v1/accounting/forex')
export class RunForexRevaluationController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post('revaluate')
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Ejecutar reexpresión cambiaria multimoneda y asentar ajuste' })
  async run(
    @Body(new ZodValidationPipe(runForexRevaluationSchema))
    body: z.infer<typeof runForexRevaluationSchema>,
  ): Promise<{
    entryId: string;
    entryNumber: string;
    totalGain: string;
    totalLoss: string;
    netDelta: string;
  }> {
    const entryId = randomUUID();

    const positions = body.positions.map((p) => {
      const parsedAmount = Money.of(p.foreignAmount, p.foreignCurrency);
      const parsedHistRate = parseDecimalToMinor(p.historicalRate, RATE_SCALE);
      const parsedCloseRate = parseDecimalToMinor(p.closingRate, RATE_SCALE);

      return {
        accountId: p.accountId,
        accountCode: p.accountCode,
        accountName: p.accountName,
        positionType: p.positionType,
        foreignCurrency: p.foreignCurrency,
        foreignAmountMinor: parsedAmount.ok ? parsedAmount.value.minorUnits : 0n,
        historicalRateScaled: parsedHistRate.ok ? parsedHistRate.value : 0n,
        closingRateScaled: parsedCloseRate.ok ? parsedCloseRate.value : 0n,
      };
    });

    const result = await this.useCases.runForexRevaluation.execute({
      id: entryId,
      tenantId: this.ctx.tenantId,
      revaluationDate: body.revaluationDate,
      functionalCurrency: body.functionalCurrency,
      gainAccountId: body.gainAccountId,
      lossAccountId: body.lossAccountId,
      description: body.description,
      positions,
    });

    const val = unwrapOrThrow(result);
    return {
      entryId: val.entryId,
      entryNumber: val.entryNumber.toString(),
      totalGain: Money.fromMinor(val.totalGainMinor, body.functionalCurrency).toString(),
      totalLoss: Money.fromMinor(val.totalLossMinor, body.functionalCurrency).toString(),
      netDelta: Money.fromMinor(val.netDeltaMinor, body.functionalCurrency).toString(),
    };
  }
}
