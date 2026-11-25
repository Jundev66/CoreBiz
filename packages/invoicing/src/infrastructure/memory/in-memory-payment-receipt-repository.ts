import type { PaymentReceipt, PaymentReceiptRepository } from '../../domain/index';

export class InMemoryPaymentReceiptRepository implements PaymentReceiptRepository {
  private readonly storage = new Map<string, PaymentReceipt>();
  private sequenceCounter = 0;

  findById(tenantId: string, id: string): Promise<PaymentReceipt | null> {
    const receipt = this.storage.get(id);
    if (!receipt || receipt.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(receipt);
  }

  findByNumber(tenantId: string, receiptNumber: string): Promise<PaymentReceipt | null> {
    for (const receipt of this.storage.values()) {
      if (receipt.tenantId === tenantId && receipt.receiptNumber === receiptNumber) {
        return Promise.resolve(receipt);
      }
    }
    return Promise.resolve(null);
  }

  listByCustomer(tenantId: string, customerId: string): Promise<readonly PaymentReceipt[]> {
    const list: PaymentReceipt[] = [];
    for (const receipt of this.storage.values()) {
      if (receipt.tenantId === tenantId && receipt.customerId === customerId) {
        list.push(receipt);
      }
    }
    list.sort((a, b) => b.receiptDate.getTime() - a.receiptDate.getTime());
    return Promise.resolve(list);
  }

  listByInvoice(tenantId: string, invoiceId: string): Promise<readonly PaymentReceipt[]> {
    const list: PaymentReceipt[] = [];
    for (const receipt of this.storage.values()) {
      if (receipt.tenantId === tenantId) {
        const hasAllocation = receipt.allocations.some((a) => a.invoiceId === invoiceId);
        if (hasAllocation) {
          list.push(receipt);
        }
      }
    }
    list.sort((a, b) => b.receiptDate.getTime() - a.receiptDate.getTime());
    return Promise.resolve(list);
  }

  nextReceiptNumber(_tenantId: string): Promise<string> {
    this.sequenceCounter++;
    const padded = this.sequenceCounter.toString().padStart(6, '0');
    return Promise.resolve(`RC-${padded}`);
  }

  save(receipt: PaymentReceipt): Promise<void> {
    this.storage.set(receipt.id, receipt);
    return Promise.resolve();
  }

  clear(): void {
    this.storage.clear();
    this.sequenceCounter = 0;
  }
}
