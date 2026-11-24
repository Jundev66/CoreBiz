import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { listJournalEntriesQuerySchema } from '@corebiz/contracts';
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
export class ListJournalEntriesController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Listar asientos del libro diario' })
  async run(
    @Query(new ZodValidationPipe(listJournalEntriesQuerySchema))
    query: z.infer<typeof listJournalEntriesQuerySchema>,
  ) {
    const result = await this.useCases.listJournalEntries.execute({
      tenantId: this.ctx.tenantId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const entries = unwrapOrThrow(result);
    return {
      entries: entries.map((entry) => ({
        id: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date.toISOString(),
        description: entry.description,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId ?? null,
        lines: entry.lines.map((l) => ({
          accountId: l.accountId,
          debitMinor: l.debitMinor,
          creditMinor: l.creditMinor,
          currency: l.currency,
          memo: l.memo ?? null,
        })),
        totalDebitMinor: entry.totalDebitMinor,
        totalCreditMinor: entry.totalCreditMinor,
      })),
    };
  }
}
