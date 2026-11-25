import 'server-only';
import { get, send } from './client';
import type { CreditNoteResponse, DebitNoteResponse, IssueInvoiceInput } from '@corebiz/contracts';

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
  return response?.invoices ?? [];
}

export async function listCreditNotes(
  affectedInvoiceId?: string,
): Promise<readonly CreditNoteResponse[]> {
  const query = affectedInvoiceId
    ? `?affectedInvoiceId=${encodeURIComponent(affectedInvoiceId)}`
    : '';
  const response = await get<{ creditNotes: readonly CreditNoteResponse[] }>(
    `/v1/invoicing/credit-notes${query}`,
  );
  return response?.creditNotes ?? [];
}

export async function listDebitNotes(
  affectedInvoiceId?: string,
): Promise<readonly DebitNoteResponse[]> {
  const query = affectedInvoiceId
    ? `?affectedInvoiceId=${encodeURIComponent(affectedInvoiceId)}`
    : '';
  const response = await get<{ debitNotes: readonly DebitNoteResponse[] }>(
    `/v1/invoicing/debit-notes${query}`,
  );
  return response?.debitNotes ?? [];
}

export async function issueInvoice(input: IssueInvoiceInput) {
  return send<{
    invoiceId: string;
    documentNumber: string;
    totalMinor: string;
    status: string;
  }>('POST', '/v1/invoicing/invoices', input);
}
