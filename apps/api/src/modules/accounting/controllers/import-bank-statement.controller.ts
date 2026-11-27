import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { importBankStatementSchema } from '@corebiz/contracts';
import { Money } from '@corebiz/shared-kernel';
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
@Controller('v1/accounting/bank-statements')
export class ImportBankStatementController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post('import')
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Importar estado de cuenta bancario' })
  async run(
    @Body(new ZodValidationPipe(importBankStatementSchema))
    body: z.infer<typeof importBankStatementSchema>,
  ): Promise<{ statementId: string; lineCount: number }> {
    const statementId = randomUUID();
    const startMoney = Money.of(body.startingBalance, body.currency);
    const endMoney = Money.of(body.endingBalance, body.currency);

    const startingBalanceMinor = startMoney.ok ? startMoney.value.minorUnits : 0n;
    const endingBalanceMinor = endMoney.ok ? endMoney.value.minorUnits : 0n;

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const lines = body.lines.map((l) => {
      const parsedAmount = Money.of(l.amount, body.currency);
      return {
        id: uuidRe.test(l.id) ? l.id : randomUUID(),
        lineType: l.lineType,
        amountMinor: parsedAmount.ok ? parsedAmount.value.minorUnits : 0n,
        transactionDate: l.transactionDate,
        reference: l.reference,
        description: l.description,
      };
    });

    const result = await this.useCases.importBankStatement.execute({
      id: statementId,
      tenantId: this.ctx.tenantId,
      bankAccountId: body.bankAccountId,
      currency: body.currency,
      startDate: body.startDate,
      endDate: body.endDate,
      startingBalanceMinor,
      endingBalanceMinor,
      lines,
    });

    const val = unwrapOrThrow(result);
    return {
      statementId: val.statementId,
      lineCount: val.lineCount,
    };
  }
}
