import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { getForexExposureQuerySchema } from '@corebiz/contracts';
import { parseDecimalToMinor, RATE_SCALE } from '@corebiz/shared-kernel';
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
export class GetForexExposureController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get('exposure')
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Consultar exposición cambiaria abierta y cálculo teórico de ajuste' })
  @ApiQuery({ name: 'functionalCurrency', enum: ['USD', 'VES'], required: false })
  @ApiQuery({ name: 'foreignCurrency', enum: ['USD', 'VES'], required: false })
  @ApiQuery({ name: 'currentRate', type: String, required: true })
  @ApiQuery({ name: 'closingRate', type: String, required: true })
  async run(
    @Query(new ZodValidationPipe(getForexExposureQuerySchema))
    query: z.infer<typeof getForexExposureQuerySchema>,
  ) {
    const histParsed = parseDecimalToMinor(query.currentRate, RATE_SCALE);
    const closeParsed = parseDecimalToMinor(query.closingRate, RATE_SCALE);

    const result = await this.useCases.getForexExposure.execute({
      tenantId: this.ctx.tenantId,
      functionalCurrency: query.functionalCurrency,
      foreignCurrency: query.foreignCurrency,
      currentRateScaled: histParsed.ok ? histParsed.value : 0n,
      closingRateScaled: closeParsed.ok ? closeParsed.value : 0n,
    });

    return unwrapOrThrow(result);
  }
}
