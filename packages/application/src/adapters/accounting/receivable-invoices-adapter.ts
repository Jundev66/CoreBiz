import type { InvoiceRepository } from '@corebiz/invoicing';
import type { ReceivableInvoiceItem, ReceivableInvoicesPort } from '@corebiz/accounting';

export class InvoicingReceivableInvoicesAdapter implements ReceivableInvoicesPort {
  constructor(private readonly invoiceRepo: InvoiceRepository) {}

  async listOpenInvoices(
    tenantId: string,
    customerId?: string,
  ): Promise<readonly ReceivableInvoiceItem[]> {
    const invoices = customerId
      ? await this.invoiceRepo.listByCustomer(tenantId, customerId)
      : await this.invoiceRepo.listByTenant(tenantId);

    const openInvoices = invoices.filter(
      (inv) => inv.status !== 'VOID' && inv.remainingBalance.isPositive,
    );

    return openInvoices.map((inv) => ({
      id: inv.id,
      tenantId: inv.tenantId,
      customerId: inv.customerId,
      customerName: `Customer ${inv.customerId}`,
      documentNumber: inv.documentNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: inv.total,
      paidAmount: inv.paidAmount,
      remainingBalance: inv.remainingBalance,
      status: inv.status,
    }));
  }
}
