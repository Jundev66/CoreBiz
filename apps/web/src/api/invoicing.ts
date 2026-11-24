import 'server-only';
import { get } from './client';

export interface InvoiceApiItem {
  readonly id: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly controlNumber: string | null;
  readonly customerId: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly currency: string;
  readonly subtotalMinor: string;
  readonly taxMinor: string;
  readonly igtfMinor: string;
  readonly totalMinor: string;
  readonly paidMinor: string;
  readonly status: string;
}

export async function listInvoices(): Promise<readonly InvoiceApiItem[]> {
  const response = await get<{ invoices: readonly InvoiceApiItem[] }>('/v1/invoicing/invoices');
  return response.invoices;
}
