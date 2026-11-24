import { ok, type Result } from '@corebiz/shared-kernel';
import type { InvoiceRepository } from '../../domain/port/invoice-repository';

export interface ListInvoicesQuery {
  readonly tenantId: string;
}

export interface InvoiceSummaryViewItem {
  readonly id: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly customerId: string;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly currency: string;
  readonly subtotalMinor: string;
  readonly taxMinor: string;
  readonly igtfMinor: string;
  readonly totalMinor: string;
  readonly paidMinor: string;
  readonly status: string;
}

export class ListInvoicesQueryHandler {
  constructor(private readonly invoiceRepository: InvoiceRepository) {}

  async execute(
    query: ListInvoicesQuery,
  ): Promise<Result<readonly InvoiceSummaryViewItem[], never>> {
    const invoices = await this.invoiceRepository.listByTenant(query.tenantId);

    const mapped: InvoiceSummaryViewItem[] = invoices.map((inv) => ({
      id: inv.id,
      documentType: inv.documentType,
      documentNumber: inv.documentNumber,
      controlNumber: inv.controlNumber,
      customerId: inv.customerId,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currency: inv.total.currency,
      subtotalMinor: inv.subtotal.minorUnits.toString(),
      taxMinor: inv.taxTotal.minorUnits.toString(),
      igtfMinor: inv.igtfTotal.minorUnits.toString(),
      totalMinor: inv.total.minorUnits.toString(),
      paidMinor: inv.paidAmount.minorUnits.toString(),
      status: inv.status,
    }));

    return ok(mapped);
  }
}
