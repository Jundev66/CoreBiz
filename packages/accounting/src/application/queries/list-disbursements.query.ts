import { ok, type Result } from '@corebiz/shared-kernel';
import type { DisbursementRepository, DisbursementCategory } from '../../domain/index';

export interface ListDisbursementsQuery {
  readonly tenantId: string;
}

export interface DisbursementViewItem {
  readonly id: string;
  readonly disbursementNumber: string;
  readonly date: string;
  readonly category: DisbursementCategory;
  readonly beneficiary: string;
  readonly taxId?: string | undefined;
  readonly receiptNumber?: string | undefined;
  readonly sourceAccountId: string;
  readonly expenseAccountId: string;
  readonly currency: string;
  readonly amount: string;
  readonly amountMinor: string;
  readonly notes: string;
  readonly journalEntryId: string;
  readonly createdAt: string;
}

export class ListDisbursementsQueryHandler {
  constructor(private readonly disbursementRepository: DisbursementRepository) {}

  async execute(
    query: ListDisbursementsQuery,
  ): Promise<Result<readonly DisbursementViewItem[], never>> {
    const list = await this.disbursementRepository.listByTenant(query.tenantId);

    const mapped: DisbursementViewItem[] = list.map((item) => ({
      id: item.id,
      disbursementNumber: item.disbursementNumber.toString(),
      date: item.date.toISOString(),
      category: item.category,
      beneficiary: item.beneficiary,
      taxId: item.taxId,
      receiptNumber: item.receiptNumber,
      sourceAccountId: item.sourceAccountId,
      expenseAccountId: item.expenseAccountId,
      currency: item.amount.currency,
      amount: item.amount.toString(),
      amountMinor: item.amount.minorUnits.toString(),
      notes: item.notes,
      journalEntryId: item.journalEntryId,
      createdAt: item.createdAt.toISOString(),
    }));

    return ok(mapped);
  }
}
