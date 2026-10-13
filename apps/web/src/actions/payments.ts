'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { receivePaymentSchema, voidPaymentSchema } from '@corebiz/contracts';
import { apiForRequest } from '@/api/session';
import { toFormFailure } from '@/api/failure';
import { formRejection } from './field-errors';

export interface PaymentActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly errorKind?: string;
  readonly errorParams?: Readonly<Record<string, string | number>>;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly createdId?: string;
  readonly createdNumber?: string;
}

const failure = toFormFailure;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function parseAllocations(formData: FormData): Array<{ deliveryNoteId: string; amount: string }> {
  const noteIds = formData
    .getAll('allocation-deliveryNoteId')
    .filter((v): v is string => typeof v === 'string');
  const amounts = formData
    .getAll('allocation-amount')
    .filter((v): v is string => typeof v === 'string');

  return noteIds
    .map((deliveryNoteId, idx) => ({
      deliveryNoteId: deliveryNoteId.trim(),
      amount: (amounts[idx] ?? '').trim(),
    }))
    .filter(
      (a) => a.deliveryNoteId !== '' && a.amount !== '' && a.amount !== '0' && a.amount !== '0.00',
    );
}

export async function receivePaymentAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const customerId = field(formData, 'customerId');
  const amount = field(formData, 'amount').trim();
  const paymentMethod = field(formData, 'paymentMethod');
  const reference = field(formData, 'reference').trim();
  const notes = field(formData, 'notes').trim();
  const allocations = parseAllocations(formData);

  const parsed = receivePaymentSchema.safeParse({
    customerId,
    amount,
    paymentMethod,
    reference: reference || undefined,
    notes: notes || undefined,
    allocations,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      errorKind: 'InvalidFormat',
      ...(await formRejection(parsed.error)),
    };
  }

  const { receiveCustomerPayment } = await apiForRequest();
  const result = await receiveCustomerPayment({
    customerId: parsed.data.customerId,
    amount: parsed.data.amount,
    paymentMethod: parsed.data.paymentMethod,
    reference: parsed.data.reference ?? null,
    notes: parsed.data.notes ?? null,
    allocations: parsed.data.allocations,
  });

  if (!result.ok) {
    return failure(result.error);
  }

  revalidatePath('/payments');
  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);
  revalidatePath('/delivery-notes');

  redirect(`/payments?creado=${encodeURIComponent(result.value.number)}`);
}

export async function voidPaymentAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const paymentId = field(formData, 'paymentId');
  const reason = field(formData, 'reason').trim();

  const parsed = voidPaymentSchema.safeParse({ reason });
  if (!parsed.success) {
    return {
      status: 'error',
      errorKind: 'InvalidFormat',
      ...(await formRejection(parsed.error)),
    };
  }

  const { voidCustomerPayment } = await apiForRequest();
  const result = await voidCustomerPayment({
    paymentId,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return failure(result.error);
  }

  revalidatePath('/payments');
  revalidatePath(`/payments/${paymentId}`);
  revalidatePath('/customers');
  revalidatePath('/delivery-notes');

  return { status: 'success' };
}
