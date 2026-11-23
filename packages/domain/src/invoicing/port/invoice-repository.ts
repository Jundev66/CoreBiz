import { type Invoice } from '../model/invoice';

export interface InvoiceRepository {
  findById(tenantId: string, id: string): Promise<Invoice | null>;
  findByNumber(
    tenantId: string,
    documentType: string,
    documentNumber: string,
  ): Promise<Invoice | null>;
  listByCustomer(tenantId: string, customerId: string): Promise<readonly Invoice[]>;
  save(invoice: Invoice): Promise<void>;
}
