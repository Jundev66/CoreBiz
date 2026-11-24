import type { Invoice, InvoiceRepository } from '../../domain/index';

export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly storage = new Map<string, Invoice>();

  findById(tenantId: string, id: string): Promise<Invoice | null> {
    const inv = this.storage.get(id);
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
    for (const inv of this.storage.values()) {
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
    for (const inv of this.storage.values()) {
      if (inv.tenantId === tenantId && inv.customerId === customerId) {
        list.push(inv);
      }
    }
    list.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());
    return Promise.resolve(list);
  }

  listByTenant(tenantId: string): Promise<readonly Invoice[]> {
    const list: Invoice[] = [];
    for (const inv of this.storage.values()) {
      if (inv.tenantId === tenantId) {
        list.push(inv);
      }
    }
    list.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());
    return Promise.resolve(list);
  }

  save(invoice: Invoice): Promise<void> {
    this.storage.set(invoice.id, invoice);
    return Promise.resolve();
  }

  clear(): void {
    this.storage.clear();
  }
}
