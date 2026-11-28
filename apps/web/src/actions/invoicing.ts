'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { applyInvoicePayment, issueInvoice } from '@/api/invoicing';
import { toFormFailure } from '@/api/failure';

export interface InvoiceFormState {
  readonly status: 'idle' | 'error';
  readonly errorKind?: string;
  readonly errorParams?: Readonly<Record<string, string | number>>;
}

const linePayloadSchema = z.object({
  productId: z.string().trim().optional(),
  description: z.string().trim().min(1).max(255),
  quantity: z.string().trim().min(1),
  unitPrice: z.string().trim().min(1),
  taxPercentage: z.coerce.number().min(0).max(100),
  revenueAccountId: z.string().trim().optional(),
});

const invoiceFormSchema = z.object({
  customerId: z.string().trim().min(1),
  documentNumber: z.string().trim().min(1).max(50),
  controlNumber: z.string().trim().max(50).optional(),
  currency: z.enum(['USD', 'VES']),
  paymentCondition: z.enum(['CASH', 'CREDIT']),
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  installmentFrequency: z.enum(['SINGLE', 'BIWEEKLY', 'MONTHLY']).optional(),
  installmentCount: z.coerce.number().int().min(1).max(48).optional(),
  paymentMethod: z
    .enum([
      'CASH_USD',
      'CASH_VES',
      'ZELLE',
      'MOBILE_PAY',
      'BANK_TRANSFER',
      'USDT',
      'POS_CARD',
      'OTHER',
    ])
    .optional(),
  receivableAccountId: z.string().trim().min(1),
  revenueAccountId: z.string().trim().min(1),
  taxPayableAccountId: z.string().trim().min(1),
  cashAccountId: z.string().trim().optional(),
  linesJson: z.string().min(2),
});

export async function issueInvoiceAction(
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const parsed = invoiceFormSchema.safeParse({
    customerId: formData.get('customerId'),
    documentNumber: formData.get('documentNumber'),
    controlNumber: formData.get('controlNumber') || undefined,
    currency: formData.get('currency'),
    paymentCondition: formData.get('paymentCondition'),
    creditDays: formData.get('creditDays') || 0,
    installmentFrequency: formData.get('installmentFrequency') || undefined,
    installmentCount: formData.get('installmentCount') || undefined,
    paymentMethod: formData.get('paymentMethod') || undefined,
    receivableAccountId: formData.get('receivableAccountId'),
    revenueAccountId: formData.get('revenueAccountId'),
    taxPayableAccountId: formData.get('taxPayableAccountId'),
    cashAccountId: formData.get('cashAccountId') || undefined,
    linesJson: formData.get('linesJson'),
  });

  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat' };
  }

  let rawLines: unknown;
  try {
    rawLines = JSON.parse(parsed.data.linesJson);
  } catch {
    return { status: 'error', errorKind: 'InvalidFormat' };
  }

  const parsedLines = z.array(linePayloadSchema).min(1).safeParse(rawLines);
  if (!parsedLines.success) {
    return { status: 'error', errorKind: 'InvalidFormat' };
  }

  const issueDate = new Date();
  const creditDays =
    parsed.data.paymentCondition === 'CREDIT' ? Math.max(1, parsed.data.creditDays) : 0;
  const dueDate = new Date(issueDate.getTime() + creditDays * 86_400_000);

  const result = await issueInvoice({
    customerId: parsed.data.customerId,
    documentType: 'STANDARD',
    documentNumber: parsed.data.documentNumber,
    ...(parsed.data.controlNumber ? { controlNumber: parsed.data.controlNumber } : {}),
    issueDate,
    dueDate,
    currency: parsed.data.currency,
    receivableAccountId: parsed.data.receivableAccountId,
    revenueAccountId: parsed.data.revenueAccountId,
    taxPayableAccountId: parsed.data.taxPayableAccountId,
    paymentCondition: parsed.data.paymentCondition,
    ...(parsed.data.paymentCondition === 'CASH' && parsed.data.cashAccountId
      ? { cashAccountId: parsed.data.cashAccountId }
      : {}),
    ...(parsed.data.paymentCondition === 'CASH' && parsed.data.paymentMethod
      ? { paymentMethod: parsed.data.paymentMethod }
      : {}),
    ...(parsed.data.paymentCondition === 'CREDIT' && parsed.data.installmentFrequency
      ? { installmentFrequency: parsed.data.installmentFrequency }
      : {}),
    ...(parsed.data.paymentCondition === 'CREDIT' && parsed.data.installmentCount
      ? { installmentCount: parsed.data.installmentCount }
      : {}),
    creditDays,
    lines: parsedLines.data.map((l) => ({
      description: l.description,
      quantity: l.quantity.replace(',', '.'),
      unitPrice: l.unitPrice.replace(',', '.'),
      taxPercentage: l.taxPercentage,
      ...(l.productId ? { productId: l.productId } : {}),
      ...(l.revenueAccountId ? { revenueAccountId: l.revenueAccountId } : {}),
    })),
  });

  if (!result.ok) {
    const failure = toFormFailure(result.error);
    return {
      status: 'error',
      ...(failure.errorKind ? { errorKind: failure.errorKind } : {}),
      ...(failure.errorParams ? { errorParams: failure.errorParams } : {}),
    };
  }

  revalidatePath('/invoicing');
  revalidatePath(`/invoicing/${result.value.invoiceId}`);
  revalidatePath('/accounting/payments');
  revalidatePath('/accounting/trial-balance');
  revalidatePath('/accounting/journal-entries');
  revalidatePath('/accounting/aging');
  revalidatePath('/fiscal/sales-book');
  redirect('/invoicing');
}

const collectPaymentFormSchema = z.object({
  invoiceId: z.string().trim().min(1),
  amount: z.string().trim().min(1),
  currency: z.enum(['USD', 'VES']),
  cashAccountId: z.string().trim().min(1),
  receivableAccountId: z.string().trim().min(1),
  paymentMethod: z
    .enum([
      'CASH_USD',
      'CASH_VES',
      'ZELLE',
      'MOBILE_PAY',
      'BANK_TRANSFER',
      'USDT',
      'POS_CARD',
      'OTHER',
    ])
    .optional(),
  exchangeRate: z.string().trim().optional(),
  installmentId: z.string().trim().optional(),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(300).optional(),
  issueExchangeRate: z.string().trim().optional(),
  paymentExchangeRate: z.string().trim().optional(),
});

export async function applyInvoicePaymentAction(
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const parsed = collectPaymentFormSchema.safeParse({
    invoiceId: formData.get('invoiceId'),
    amount: formData.get('amount'),
    currency: formData.get('currency'),
    cashAccountId: formData.get('cashAccountId'),
    receivableAccountId: formData.get('receivableAccountId'),
    paymentMethod: formData.get('paymentMethod') || undefined,
    exchangeRate: formData.get('exchangeRate') || undefined,
    installmentId: formData.get('installmentId') || undefined,
    reference: formData.get('reference') || undefined,
    notes: formData.get('notes') || undefined,
    issueExchangeRate: formData.get('issueExchangeRate') || undefined,
    paymentExchangeRate: formData.get('paymentExchangeRate') || undefined,
  });

  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat' };
  }

  const normalizedAmount = parsed.data.amount.replace(',', '.');
  const exchangeRate = parsed.data.exchangeRate?.replace(',', '.');
  const issueRate = parsed.data.issueExchangeRate?.replace(',', '.');
  const paymentRate = parsed.data.paymentExchangeRate?.replace(',', '.');

  const result = await applyInvoicePayment(parsed.data.invoiceId, {
    invoiceId: parsed.data.invoiceId,
    amount: normalizedAmount,
    currency: parsed.data.currency,
    paymentDate: new Date(),
    cashAccountId: parsed.data.cashAccountId,
    receivableAccountId: parsed.data.receivableAccountId,
    ...(parsed.data.paymentMethod ? { paymentMethod: parsed.data.paymentMethod } : {}),
    ...(exchangeRate ? { exchangeRate } : {}),
    ...(parsed.data.installmentId ? { installmentId: parsed.data.installmentId } : {}),
    ...(parsed.data.reference ? { reference: parsed.data.reference } : {}),
    ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    ...(issueRate ? { issueExchangeRate: issueRate } : {}),
    ...(paymentRate ? { paymentExchangeRate: paymentRate } : {}),
  });

  if (!result.ok) {
    const failure = toFormFailure(result.error);
    return {
      status: 'error',
      ...(failure.errorKind ? { errorKind: failure.errorKind } : {}),
      ...(failure.errorParams ? { errorParams: failure.errorParams } : {}),
    };
  }

  revalidatePath('/invoicing');
  revalidatePath(`/invoicing/${result.value.invoiceId}`);
  revalidatePath('/accounting/payments');
  revalidatePath('/accounting/trial-balance');
  revalidatePath('/accounting/journal-entries');
  revalidatePath('/accounting/aging');
  redirect('/invoicing');
}
