import { err, ok, type Result } from '@corebiz/shared-kernel';
import type { InvoiceRepository } from '../../domain/port/invoice-repository';

export interface GetInvoiceByIdQuery {
  readonly tenantId: string;
  readonly invoiceId: string;
}

export interface InvoiceLineDetailViewItem {
  readonly id: string;
  readonly productId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPriceMinor: string;
  readonly taxPercentage: number;
  readonly subtotalMinor: string;
  readonly taxMinor: string;
  readonly totalMinor: string;
}

export interface InvoiceDetailViewItem {
  readonly id: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly controlNumber: string | null;
  readonly customerId: string;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly currency: string;
  readonly paymentCondition: string;
  readonly subtotalMinor: string;
  readonly taxMinor: string;
  readonly igtfMinor: string;
  readonly totalMinor: string;
  readonly paidMinor: string;
  readonly creditedMinor: string;
  readonly remainingBalanceMinor: string;
  readonly status: string;
  readonly lines: readonly InvoiceLineDetailViewItem[];
}

export interface GetInvoiceByIdError {
  readonly kind: 'InvoiceNotFound';
  readonly invoiceId: string;
}

export class GetInvoiceByIdQueryHandler {
  constructor(private readonly invoiceRepository: InvoiceRepository) {}

  async execute(
    query: GetInvoiceByIdQuery,
  ): Promise<Result<InvoiceDetailViewItem, GetInvoiceByIdError>> {
    const inv = await this.invoiceRepository.findById(query.tenantId, query.invoiceId);
    if (!inv) {
      return err({ kind: 'InvoiceNotFound', invoiceId: query.invoiceId });
    }

    return ok({
      id: inv.id,
      documentType: inv.documentType,
      documentNumber: inv.documentNumber,
      controlNumber: inv.controlNumber ?? null,
      customerId: inv.customerId,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currency: inv.total.currency,
      paymentCondition: inv.paymentCondition,
      subtotalMinor: inv.subtotal.minorUnits.toString(),
      taxMinor: inv.taxTotal.minorUnits.toString(),
      igtfMinor: inv.igtfTotal.minorUnits.toString(),
      totalMinor: inv.total.minorUnits.toString(),
      paidMinor: inv.paidAmount.minorUnits.toString(),
      creditedMinor: inv.creditedAmount.minorUnits.toString(),
      remainingBalanceMinor: inv.remainingBalance.minorUnits.toString(),
      status: inv.status,
      lines: inv.lines.map((line) => ({
        id: line.id,
        productId: line.productId ?? null,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPriceMinor: line.unitPrice.minorUnits.toString(),
        taxPercentage: line.taxRate.percentage,
        subtotalMinor: line.subtotal.minorUnits.toString(),
        taxMinor: line.taxAmount.minorUnits.toString(),
        totalMinor: line.total.minorUnits.toString(),
      })),
    });
  }
}
