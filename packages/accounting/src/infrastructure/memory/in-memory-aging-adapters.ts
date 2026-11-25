import type {
  ReceivableInvoiceItem,
  ReceivableInvoicesPort,
  PayableBillItem,
  PayableBillsPort,
} from '../../domain/port/aging-ports';

export class InMemoryReceivableInvoicesAdapter implements ReceivableInvoicesPort {
  private readonly items: ReceivableInvoiceItem[] = [];

  addInvoice(item: ReceivableInvoiceItem): void {
    this.items.push(item);
  }

  setInvoices(items: readonly ReceivableInvoiceItem[]): void {
    this.items.length = 0;
    this.items.push(...items);
  }

  listOpenInvoices(
    tenantId: string,
    customerId?: string,
  ): Promise<readonly ReceivableInvoiceItem[]> {
    const list = this.items.filter((item) => {
      if (item.tenantId !== tenantId) return false;
      if (customerId && item.customerId !== customerId) return false;
      return true;
    });
    return Promise.resolve(list);
  }

  clear(): void {
    this.items.length = 0;
  }
}

export class InMemoryPayableBillsAdapter implements PayableBillsPort {
  private readonly items: PayableBillItem[] = [];

  addBill(item: PayableBillItem): void {
    this.items.push(item);
  }

  setBills(items: readonly PayableBillItem[]): void {
    this.items.length = 0;
    this.items.push(...items);
  }

  listOpenBills(tenantId: string, supplierId?: string): Promise<readonly PayableBillItem[]> {
    const list = this.items.filter((item) => {
      if (item.tenantId !== tenantId) return false;
      if (supplierId && item.supplierId !== supplierId) return false;
      return true;
    });
    return Promise.resolve(list);
  }

  clear(): void {
    this.items.length = 0;
  }
}
