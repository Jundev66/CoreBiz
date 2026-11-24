import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiHeader } from '@nestjs/swagger';
import type { z } from 'zod';
import { integrationJournalEntrySchema } from '@corebiz/contracts';
import { PostJournalEntryCommandHandler } from '@corebiz/application';
import { IntegrationsApiKeyGuard } from '../../../auth/integrations-api-key.guard';
import { IntegrationsThrottleGuard } from '../../../auth/integrations-throttle.guard';
import { IdempotencyInterceptor } from '../../../auth/idempotency.interceptor';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { INTEGRATIONS_RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

const DEFAULT_INTEGRATION_TENANT_ID = '00000000-0000-4000-8000-000000000001';

@ApiTags('integraciones')
@ApiBearerAuth()
@UseGuards(IntegrationsApiKeyGuard, IntegrationsThrottleGuard)
@UseInterceptors(IdempotencyInterceptor)
@Controller('v1/integrations')
export class PostIntegrationJournalEntryController {
  constructor(@Inject(INTEGRATIONS_RUNTIME) private readonly runtime: Runtime) {}

  @Post('journal-entries')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registro directo de asiento contable balanceado para sistemas externos',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Clave de idempotencia obligatoria',
  })
  @ApiHeader({ name: 'x-tenant-id', required: false, description: 'ID del tenant objetivo' })
  async run(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body(new ZodValidationPipe(integrationJournalEntrySchema))
    body: z.infer<typeof integrationJournalEntrySchema>,
  ) {
    const tenantId = tenantIdHeader?.trim() || DEFAULT_INTEGRATION_TENANT_ID;

    const lines = body.lines.map((l) => ({
      accountId: l.accountId,
      debitMinor: BigInt(l.debitMinor),
      creditMinor: BigInt(l.creditMinor),
      currency: body.currency,
      memo: l.description,
    }));

    const handler = new PostJournalEntryCommandHandler(
      this.runtime.accounts,
      this.runtime.journalEntries,
    );

    const result = await handler.execute({
      id: crypto.randomUUID(),
      tenantId,
      date: body.date,
      description: body.description,
      sourceType: 'EXTERNAL_API',
      sourceId: body.reference,
      lines,
    });

    const val = unwrapOrThrow(result);
    return {
      ok: true,
      journalEntryId: val.entryId,
      entryNumber: val.entryNumber.toString(),
    };
  }
}
