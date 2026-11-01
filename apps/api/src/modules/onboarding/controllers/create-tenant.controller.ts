import { Body, Controller, Inject, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ExchangeRate } from '@corebiz/domain';
import { provisionTenant } from '@corebiz/infrastructure';
import { domainError } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { IDENTITY } from '../../../tokens';
import type { VerifiedIdentity } from '../../../auth/authenticated-request';
import { databaseUrl } from '../../../config/driver';
import { loadEnv } from '../../../config/env';

const createTenantSchema = z
  .object({
    name: z.string().trim().min(2, 'TooShort').max(120, 'TooLong'),
    baseCurrency: z.enum(['USD', 'VES']).optional(),
    taxLabel: z.string().trim().min(2, 'TooShort').max(60, 'TooLong').optional(),
    taxRateBp: z.coerce.number().int().min(0).max(10_000).optional(),
    exchangeRate: z.string().trim().max(32).optional().or(z.literal('')),
  })
  .strict();

@ApiTags('alta')
@ApiBearerAuth()
@Controller('v1')
export class CreateTenantController {
  constructor(@Inject(IDENTITY) private readonly identity: VerifiedIdentity) {}

  @Post('onboarding/tenants')
  @ApiOperation({ summary: 'Crear la empresa de quien acaba de registrarse' })
  async run(
    @Body(new ZodValidationPipe(createTenantSchema)) body: z.infer<typeof createTenantSchema>,
  ): Promise<{ tenantId: string }> {
    if (!loadEnv().SIGNUP_ENABLED) throw new NotFoundException();

    const baseCurrency = body.baseCurrency ?? 'USD';

    let exchangeRateScaled: bigint | undefined;
    if (body.exchangeRate !== undefined && body.exchangeRate.trim() !== '') {
      const parsed = ExchangeRate.of(
        body.exchangeRate,
        baseCurrency,
        baseCurrency === 'USD' ? 'VES' : 'USD',
        new Date(),
      );
      if (!parsed.ok) throw domainError('INVALID_EXCHANGE_RATE');
      exchangeRateScaled = parsed.value.scaledRate;
    }

    const result = await provisionTenant(databaseUrl(), this.identity.userId, {
      name: body.name,
      baseCurrency,
      ...(body.taxLabel !== undefined ? { taxLabel: body.taxLabel } : {}),
      ...(body.taxRateBp !== undefined ? { taxRateBp: body.taxRateBp } : {}),
      ...(exchangeRateScaled !== undefined ? { exchangeRateScaled } : {}),
    });

    if (!result.ok || result.tenantId === undefined) {
      throw domainError(result.error ?? 'UNKNOWN');
    }
    return { tenantId: result.tenantId };
  }
}
