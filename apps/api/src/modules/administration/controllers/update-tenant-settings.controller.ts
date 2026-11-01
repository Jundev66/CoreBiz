import { Body, Controller, Inject, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { updateTenantSettingsSchema } from '@corebiz/contracts';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { withoutUndefined } from '../../../http/list-queries';
import { bigintToString } from '../../../http/serialize';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class UpdateTenantSettingsController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Patch('settings')
  @RequirePermission('settings:write')
  @ApiOperation({ summary: 'Ajustes de la empresa' })
  async run(
    @Body(new ZodValidationPipe(updateTenantSettingsSchema))
    body: z.infer<typeof updateTenantSettingsSchema>,
  ): Promise<Record<string, string | number>> {
    const saved = unwrapOrThrow(await this.useCases.updateTenantSettings(withoutUndefined(body)));

    return {
      ...(saved.name !== undefined ? { name: saved.name } : {}),
      ...(saved.taxLabel !== undefined ? { taxLabel: saved.taxLabel } : {}),
      ...(saved.taxRateBp !== undefined ? { taxRateBp: saved.taxRateBp } : {}),
      ...(saved.baseCurrency !== undefined ? { baseCurrency: saved.baseCurrency } : {}),
      ...(saved.exchangeRateScaled !== undefined && saved.exchangeRateScaled !== null
        ? { exchangeRateScaled: bigintToString(saved.exchangeRateScaled) ?? '' }
        : {}),
    };
  }
}
