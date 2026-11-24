import { ok, type Result } from '@corebiz/shared-kernel';
import type { InvoiceRepository } from '@corebiz/invoicing';
import {
  UnitedStatesTaxReportService,
  type UsSalesTaxReportSummary,
  type UsSalesTaxSourceTransaction,
} from '@corebiz/fiscal';

export interface GenerateUsTaxSummaryQuery {
  readonly tenantId: string;
  readonly startDate?: Date | undefined;
  readonly endDate?: Date | undefined;
}

export class GenerateUsTaxSummaryQueryHandler {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly usTaxReportService: UnitedStatesTaxReportService = new UnitedStatesTaxReportService(),
  ) {}

  async execute(query: GenerateUsTaxSummaryQuery): Promise<Result<UsSalesTaxReportSummary, never>> {
    const invoices = await this.invoiceRepository.listByTenant(query.tenantId);
    const start = query.startDate ?? new Date(0);
    const end = query.endDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const filtered = invoices.filter((i) => i.issueDate >= start && i.issueDate <= end);

    const transactions: UsSalesTaxSourceTransaction[] = filtered.map((inv) => ({
      invoiceId: inv.id,
      issueDate: inv.issueDate,
      stateCode: 'US',
      jurisdictionName: 'Standard Sales Tax',
      grossAmountMinor: inv.total.minorUnits,
      isTaxExempt: inv.taxTotal.minorUnits === 0n,
      taxRatePercentage: 7,
      taxAmountMinor: inv.taxTotal.minorUnits,
      currency: inv.total.currency,
    }));

    return ok(this.usTaxReportService.buildUsSalesTaxSummary(transactions));
  }
}
