import { expect, vi } from 'vitest';
import type { InvoiceRepository } from '../../src/invoicing/port/invoice-repository';
import type { Invoice } from '../../src/invoicing/model/invoice';

export class InvoiceRepositoryMock implements InvoiceRepository {
  private readonly saveMock = vi.fn<(invoice: Invoice) => Promise<void>>();
  private readonly findByIdMock =
    vi.fn<(tenantId: string, id: string) => Promise<Invoice | null>>();
  private readonly findByNumberMock =
    vi.fn<
      (tenantId: string, documentType: string, documentNumber: string) => Promise<Invoice | null>
    >();
  private readonly listByCustomerMock =
    vi.fn<(tenantId: string, customerId: string) => Promise<readonly Invoice[]>>();

  async save(invoice: Invoice): Promise<void> {
    await this.saveMock(invoice);
  }

  async findById(tenantId: string, id: string): Promise<Invoice | null> {
    return this.findByIdMock(tenantId, id);
  }

  async findByNumber(
    tenantId: string,
    documentType: string,
    documentNumber: string,
  ): Promise<Invoice | null> {
    return this.findByNumberMock(tenantId, documentType, documentNumber);
  }

  async listByCustomer(tenantId: string, customerId: string): Promise<readonly Invoice[]> {
    return this.listByCustomerMock(tenantId, customerId);
  }

  returnOnFindById(invoice: Invoice | null): void {
    this.findByIdMock.mockResolvedValue(invoice);
  }

  returnOnFindByNumber(invoice: Invoice | null): void {
    this.findByNumberMock.mockResolvedValue(invoice);
  }

  assertSaveHasBeenCalledWith(expectedInvoice: Invoice): void {
    expect(this.saveMock).toHaveBeenCalledWith(expectedInvoice);
  }

  assertSaveHasBeenCalled(): void {
    expect(this.saveMock).toHaveBeenCalled();
  }
}
