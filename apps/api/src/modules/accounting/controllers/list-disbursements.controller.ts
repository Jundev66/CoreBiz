import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DisbursementResponseDto } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/disbursements')
export class ListDisbursementsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Listar egresos operativos, fletes y gastos logísticos' })
  async list(): Promise<readonly DisbursementResponseDto[]> {
    const result = await this.useCases.listDisbursements.execute({
      tenantId: this.ctx.tenantId,
    });

    if (!result.ok) {
      return [];
    }

    return result.value.map((item) => ({
      id: item.id,
      disbursementNumber: item.disbursementNumber,
      date: item.date,
      category: item.category,
      beneficiary: item.beneficiary,
      taxId: item.taxId,
      receiptNumber: item.receiptNumber,
      sourceAccountId: item.sourceAccountId,
      expenseAccountId: item.expenseAccountId,
      currency: item.currency,
      amount: item.amount,
      amountMinor: item.amountMinor,
      notes: item.notes,
      journalEntryId: item.journalEntryId,
      createdAt: item.createdAt,
    }));
  }
}
