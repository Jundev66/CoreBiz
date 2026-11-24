import { ok, type Result } from '@corebiz/shared-kernel';
import type { InvoiceRepository } from '@corebiz/invoicing';
import {
  VenezuelaFiscalBookService,
  type SalesBookSummary,
  type SalesSourceTransaction,
} from '@corebiz/fiscal';

export interface GenerateSalesBookQuery {
  readonly tenantId: string;
  readonly startDate?: Date | undefined;
  readonly endDate?: Date | undefined;
}

export class GenerateSalesBookQueryHandler {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly fiscalBookService: VenezuelaFiscalBookService = new VenezuelaFiscalBookService(),
  ) {}

  async execute(query: GenerateSalesBookQuery): Promise<Result<SalesBookSummary, never>> {
    const invoices = await this.invoiceRepository.listByTenant(query.tenantId);
    const start = query.startDate ?? new Date(0);
    const end = query.endDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const filtered = invoices.filter((i) => i.issueDate >= start && i.issueDate <= end);

    const transactions: SalesSourceTransaction[] = filtered.map((inv) => {
      let exemptMinor = 0n;
      let taxableBaseGeneralMinor = 0n;
      let taxGeneralMinor = 0n;
      let taxableBaseReducedMinor = 0n;
      let taxReducedMinor = 0n;

      for (const line of inv.lines) {
        if (line.taxRate.basisPoints === 0) {
          exemptMinor += line.subtotal.minorUnits;
        } else if (line.taxRate.basisPoints === 800) {
          taxableBaseReducedMinor += line.subtotal.minorUnits;
          taxReducedMinor += line.taxAmount.minorUnits;
        } else {
          taxableBaseGeneralMinor += line.subtotal.minorUnits;
          taxGeneralMinor += line.taxAmount.minorUnits;
        }
      }

      const docType =
        inv.documentType === 'CREDIT_NOTE'
          ? 'NOTA_CREDITO'
          : inv.documentType === 'DEBIT_NOTE'
            ? 'NOTA_DEBITO'
            : 'FACTURA';

      return {
        invoiceId: inv.id,
        issueDate: inv.issueDate,
        customerTaxId: inv.customerId,
        customerName: inv.customerId,
        documentNumber: inv.documentNumber,
        controlNumber: inv.controlNumber,
        documentType: docType,
        totalMinor: inv.total.minorUnits,
        exemptMinor,
        taxableBaseGeneralMinor,
        taxGeneralMinor,
        taxGeneralPercentage: 16,
        taxableBaseReducedMinor,
        taxReducedMinor,
        taxReducedPercentage: 8,
        igtfMinor: inv.igtfTotal.minorUnits,
        vatWithheldMinor: 0n,
        currency: inv.total.currency,
      };
    });

    return ok(this.fiscalBookService.buildSalesBook(transactions));
  }
}
