import type { Invoice, InvoiceRepository } from '@corebiz/domain';

export class InMemoryInvoiceRepository implements InvoiceRepository {
  constructor(private readonly store: Map<string, Invoice> = new Map()) {}

  findById(tenantId: string, id: string): Promise<Invoice | null> {
    const inv = this.store.get(id);
    if (!inv || inv.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(inv);
  }

  findByNumber(
    tenantId: string,
    documentType: string,
    documentNumber: string,
  ): Promise<Invoice | null> {
    for (const inv of this.store.values()) {
      if (
        inv.tenantId === tenantId &&
        inv.documentType === documentType &&
        inv.documentNumber === documentNumber
      ) {
        return Promise.resolve(inv);
      }
    }
    return Promise.resolve(null);
  }

  listByCustomer(tenantId: string, customerId: string): Promise<readonly Invoice[]> {
    const list: Invoice[] = [];
    for (const inv of this.store.values()) {
      if (inv.tenantId === tenantId && inv.customerId === customerId) {
        list.push(inv);
      }
    }
    return Promise.resolve(list);
  }

  save(invoice: Invoice): Promise<void> {
    this.store.set(invoice.id, invoice);
    return Promise.resolve();
  }
}
