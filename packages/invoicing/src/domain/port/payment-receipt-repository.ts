import type { PaymentReceipt } from '../model/payment-receipt';

export interface PaymentReceiptRepository {
  findById(tenantId: string, id: string): Promise<PaymentReceipt | null>;
  findByNumber(tenantId: string, receiptNumber: string): Promise<PaymentReceipt | null>;
  listByCustomer(tenantId: string, customerId: string): Promise<readonly PaymentReceipt[]>;
  listByInvoice(tenantId: string, invoiceId: string): Promise<readonly PaymentReceipt[]>;
  nextReceiptNumber(tenantId: string): Promise<string>;
  save(receipt: PaymentReceipt): Promise<void>;
}
