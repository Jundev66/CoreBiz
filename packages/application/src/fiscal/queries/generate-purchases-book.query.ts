import { ok, type Result } from '@corebiz/shared-kernel';
import {
  VenezuelaFiscalBookService,
  type PurchasesBookSummary,
  type PurchasesSourceTransaction,
} from '@corebiz/fiscal';

export interface GeneratePurchasesBookQuery {
  readonly tenantId: string;
  readonly startDate?: Date | undefined;
  readonly endDate?: Date | undefined;
}

export type PurchasesBookLoader = (
  tenantId: string,
  startDate?: Date,
  endDate?: Date,
) => Promise<readonly PurchasesSourceTransaction[]>;

export class GeneratePurchasesBookQueryHandler {
  constructor(
    private readonly fiscalBookService: VenezuelaFiscalBookService = new VenezuelaFiscalBookService(),
    private readonly loadTransactions?: PurchasesBookLoader,
  ) {}

  async execute(query: GeneratePurchasesBookQuery): Promise<Result<PurchasesBookSummary, never>> {
    const transactions = this.loadTransactions
      ? await this.loadTransactions(query.tenantId, query.startDate, query.endDate)
      : [];
    return ok(this.fiscalBookService.buildPurchasesBook(transactions));
  }
}
