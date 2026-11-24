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

export class GeneratePurchasesBookQueryHandler {
  constructor(
    private readonly fiscalBookService: VenezuelaFiscalBookService = new VenezuelaFiscalBookService(),
  ) {}

  async execute(_query: GeneratePurchasesBookQuery): Promise<Result<PurchasesBookSummary, never>> {
    const transactions: PurchasesSourceTransaction[] = [];
    return Promise.resolve(ok(this.fiscalBookService.buildPurchasesBook(transactions)));
  }
}
