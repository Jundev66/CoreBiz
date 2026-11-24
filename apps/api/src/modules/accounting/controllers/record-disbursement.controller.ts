import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { recordDisbursementSchema, type DisbursementResponseDto } from '@corebiz/contracts';
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
@Controller('v1/accounting/disbursements')
export class RecordDisbursementController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Registrar egreso operativo, flete o gasto logístico' })
  async run(
    @Body(new ZodValidationPipe(recordDisbursementSchema))
    body: z.infer<typeof recordDisbursementSchema>,
  ): Promise<DisbursementResponseDto> {
    const disbursementId = randomUUID();
    const parsedAmount = Money.of(body.amount, body.currency);
    const amountMinor = parsedAmount.ok ? parsedAmount.value.minorUnits : 0n;

    const result = await this.useCases.recordDisbursement.execute({
      id: disbursementId,
      tenantId: this.ctx.tenantId,
      date: body.date,
      category: body.category,
      beneficiary: body.beneficiary,
      taxId: body.taxId,
      receiptNumber: body.receiptNumber,
      sourceAccountId: body.sourceAccountId,
      expenseAccountId: body.expenseAccountId,
      currency: body.currency,
      amountMinor,
      notes: body.notes,
    });

    const val = unwrapOrThrow(result);
    const disbursement = val.disbursement;

    return {
      id: disbursement.id,
      disbursementNumber: disbursement.disbursementNumber.toString(),
      date: disbursement.date.toISOString(),
      category: disbursement.category,
      beneficiary: disbursement.beneficiary,
      taxId: disbursement.taxId,
      receiptNumber: disbursement.receiptNumber,
      sourceAccountId: disbursement.sourceAccountId,
      expenseAccountId: disbursement.expenseAccountId,
      currency: disbursement.amount.currency,
      amount: disbursement.amount.toString(),
      amountMinor: disbursement.amount.minorUnits.toString(),
      notes: disbursement.notes,
      journalEntryId: disbursement.journalEntryId,
      createdAt: disbursement.createdAt.toISOString(),
    };
  }
}
