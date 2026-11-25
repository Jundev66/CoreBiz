import type { PaymentReceiptRepository } from '../../domain/port/payment-receipt-repository';
import type { PaymentReceipt } from '../../domain/model/payment-receipt';

export interface ListInvoiceReceiptsQuery {
  readonly tenantId: string;
  readonly invoiceId: string;
}

export class ListInvoiceReceiptsQueryHandler {
  constructor(private readonly receiptRepository: PaymentReceiptRepository) {}

  async execute(query: ListInvoiceReceiptsQuery): Promise<readonly PaymentReceipt[]> {
    return this.receiptRepository.listByInvoice(query.tenantId, query.invoiceId);
  }
}
