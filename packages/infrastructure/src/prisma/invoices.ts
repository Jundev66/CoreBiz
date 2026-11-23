import type { PrismaClient } from '@corebiz/prisma-client';
import {
  Invoice,
  InvoiceLine,
  Money,
  Quantity,
  TaxRate,
  type Currency,
  type InvoiceRepository,
  type InvoiceStatus,
  type InvoiceType,
} from '@corebiz/domain';
import type { Tx } from './session';

export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(private readonly client: PrismaClient | Tx) {}

  async findById(tenantId: string, id: string): Promise<Invoice | null> {
    const row = await this.client.invoices.findFirst({
      where: {
        tenant_id: tenantId,
        id,
      },
      include: {
        invoice_lines: true,
      },
    });

    if (!row) {
      return null;
    }

    return this.mapToDomain(row);
  }

  async findByNumber(
    tenantId: string,
    documentType: string,
    documentNumber: string,
  ): Promise<Invoice | null> {
    const row = await this.client.invoices.findFirst({
      where: {
        tenant_id: tenantId,
        document_type: documentType,
        document_number: documentNumber,
      },
      include: {
        invoice_lines: true,
      },
    });

    if (!row) {
      return null;
    }

    return this.mapToDomain(row);
  }

  async listByCustomer(tenantId: string, customerId: string): Promise<readonly Invoice[]> {
    const rows = await this.client.invoices.findMany({
      where: {
        tenant_id: tenantId,
        customer_id: customerId,
      },
      include: {
        invoice_lines: true,
      },
      orderBy: {
        issue_date: 'desc',
      },
    });

    const list: Invoice[] = [];
    for (const row of rows) {
      const inv = this.mapToDomain(row);
      if (inv) {
        list.push(inv);
      }
    }

    return list;
  }

  async save(invoice: Invoice): Promise<void> {
    await this.client.invoices.upsert({
      where: {
        tenant_id_document_number: {
          tenant_id: invoice.tenantId,
          document_number: invoice.documentNumber,
        },
      },
      create: {
        id: invoice.id,
        tenant_id: invoice.tenantId,
        customer_id: invoice.customerId,
        document_type: invoice.documentType,
        document_number: invoice.documentNumber,
        control_number: invoice.controlNumber ?? null,
        issue_date: invoice.issueDate,
        due_date: invoice.dueDate,
        currency: invoice.total.currency,
        subtotal_minor: invoice.subtotal.minorUnits,
        tax_minor: invoice.taxTotal.minorUnits,
        igtf_minor: invoice.igtfTotal.minorUnits,
        total_minor: invoice.total.minorUnits,
        paid_minor: invoice.paidAmount.minorUnits,
        status: invoice.status,
        invoice_lines: {
          create: invoice.lines.map((l) => ({
            id: l.id,
            tenant_id: invoice.tenantId,
            product_id: l.productId ?? null,
            description: l.description,
            quantity_scaled: l.quantity.scaledValue,
            unit_price_minor: l.unitPrice.minorUnits,
            tax_rate_bp: l.taxRate.basisPoints,
            subtotal_minor: l.subtotal.minorUnits,
            tax_minor: l.taxAmount.minorUnits,
            total_minor: l.total.minorUnits,
          })),
        },
      },
      update: {
        status: invoice.status,
        paid_minor: invoice.paidAmount.minorUnits,
        control_number: invoice.controlNumber ?? null,
      },
    });
  }

  private mapToDomain(row: {
    id: string;
    tenant_id: string;
    customer_id: string;
    document_type: string;
    document_number: string;
    control_number: string | null;
    issue_date: Date;
    due_date: Date;
    currency: string;
    paid_minor: bigint;
    igtf_minor: bigint;
    status: string;
    invoice_lines: Array<{
      id: string;
      product_id: string | null;
      description: string;
      quantity_scaled: bigint;
      unit_price_minor: bigint;
      tax_rate_bp: number;
    }>;
  }): Invoice | null {
    const lines: InvoiceLine[] = [];
    for (const l of row.invoice_lines) {
      const taxRateRes = TaxRate.fromBasisPoints(l.tax_rate_bp);
      if (!taxRateRes.ok) {
        return null;
      }

      const lineRes = InvoiceLine.create(
        l.id,
        l.description,
        Quantity.fromScaled(l.quantity_scaled),
        Money.fromMinor(l.unit_price_minor, row.currency as Currency),
        taxRateRes.value,
        l.product_id ?? undefined,
      );
      if (!lineRes.ok) {
        return null;
      }
      lines.push(lineRes.value);
    }

    const invRes = Invoice.create({
      id: row.id,
      tenantId: row.tenant_id,
      customerId: row.customer_id,
      documentType: row.document_type as InvoiceType,
      documentNumber: row.document_number,
      controlNumber: row.control_number ?? undefined,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      lines,
      status: row.status as InvoiceStatus,
      paidAmount: Money.fromMinor(row.paid_minor, row.currency as Currency),
      igtfTotal: Money.fromMinor(row.igtf_minor, row.currency as Currency),
    });

    return invRes.ok ? invRes.value : null;
  }
}
