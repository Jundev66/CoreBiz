import 'server-only';
import { get, send } from './client';
import type {
  ApplyInvoicePaymentInput,
  CreditNoteResponse,
  DebitNoteResponse,
  IssueInvoiceInput,
} from '@corebiz/contracts';

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

export interface InvoiceLineDetailApiItem {
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

export interface DocumentInstallmentApiItem {
  readonly id: string;
  readonly installmentNumber: number;
  readonly frequency: string;
  readonly dueDate: string;
  readonly currency: string;
  readonly amountMinor: string;
  readonly paidMinor: string;
  readonly status: string;
}

export interface DocumentPaymentApiItem {
  readonly id: string;
  readonly paymentNumber: string;
  readonly installmentId: string | null;
  readonly paymentMethod: string;
  readonly paymentCurrency: string;
  readonly paymentAmountMinor: string;
  readonly documentCurrency: string;
  readonly appliedAmountMinor: string;
  readonly exchangeRateScaled: string;
  readonly accountId: string;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly journalEntryId: string | null;
  readonly paymentDate: string;
  readonly reference: string | null;
  readonly notes: string | null;
}

export interface InvoiceDetailApiItem extends InvoiceApiItem {
  readonly paymentCondition: string;
  readonly creditedMinor: string;
  readonly remainingBalanceMinor: string;
  readonly lines: readonly InvoiceLineDetailApiItem[];
  readonly installments?: readonly DocumentInstallmentApiItem[];
  readonly payments?: readonly DocumentPaymentApiItem[];
}

export interface InvoiceReceiptApiItem {
  readonly id: string;
  readonly receiptNumber: string;
  readonly customerId: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentMethod: string;
  readonly bankAccountId: string;
  readonly receiptDate: string;
  readonly reference: string | null;
  readonly status: string;
  readonly notes: string | null;
}

export async function listInvoices(): Promise<readonly InvoiceApiItem[]> {
  const response = await get<{ invoices: readonly InvoiceApiItem[] }>('/v1/invoicing/invoices');
  return response?.invoices ?? [];
}

export async function getInvoiceById(id: string): Promise<InvoiceDetailApiItem | null> {
  try {
    return await get<InvoiceDetailApiItem>(`/v1/invoicing/invoices/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

export async function listInvoiceReceipts(id: string): Promise<readonly InvoiceReceiptApiItem[]> {
  try {
    const response = await get<readonly InvoiceReceiptApiItem[]>(
      `/v1/invoicing/invoices/${encodeURIComponent(id)}/receipts`,
    );
    return response ?? [];
  } catch {
    return [];
  }
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

export async function applyInvoicePayment(invoiceId: string, input: ApplyInvoicePaymentInput) {
  return send<{
    invoiceId: string;
    remainingBalanceMinor: string;
    fxDifferenceMinor: string;
  }>('POST', `/v1/invoicing/invoices/${encodeURIComponent(invoiceId)}/payments`, input);
}
