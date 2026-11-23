import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { postJournalEntrySchema } from '@corebiz/contracts';
import { Money } from '@corebiz/domain';
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
@Controller('v1/accounting/journal-entries')
export class PostJournalEntryController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Registrar un asiento de diario contable' })
  async run(
    @Body(new ZodValidationPipe(postJournalEntrySchema))
    body: z.infer<typeof postJournalEntrySchema>,
  ): Promise<{ entryId: string; entryNumber: string }> {
    const lines = body.lines.map((l) => {
      const debitParsed = Money.of(l.debitAmount, l.currency);
      const creditParsed = Money.of(l.creditAmount, l.currency);
      return {
        accountId: l.accountId,
        debitMinor: debitParsed.ok ? debitParsed.value.minorUnits : 0n,
        creditMinor: creditParsed.ok ? creditParsed.value.minorUnits : 0n,
        currency: l.currency,
        memo: l.memo,
      };
    });

    const result = await this.useCases.postJournalEntry.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      date: body.date,
      description: body.description,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      lines,
    });

    const val = unwrapOrThrow(result);
    return {
      entryId: val.entryId,
      entryNumber: val.entryNumber.toString(),
    };
  }
}
