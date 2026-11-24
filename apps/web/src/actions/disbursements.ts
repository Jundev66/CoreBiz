'use server';

import { revalidatePath } from 'next/cache';
import { recordDisbursement } from '@/api/disbursements';
import { recordDisbursementSchema, type DisbursementCategoryDto } from '@corebiz/contracts';

export interface DisbursementActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly error?: string;
  readonly disbursementNumber?: string;
}

export async function recordDisbursementAction(
  _prev: DisbursementActionState,
  formData: FormData,
): Promise<DisbursementActionState> {
  const dateStr = formData.get('date') as string;
  const category = formData.get('category') as string | null as DisbursementCategoryDto;
  const beneficiary = formData.get('beneficiary') as string;
  const taxId = (formData.get('taxId') as string) || undefined;
  const receiptNumber = (formData.get('receiptNumber') as string) || undefined;
  const sourceAccountId = formData.get('sourceAccountId') as string;
  const expenseAccountId = formData.get('expenseAccountId') as string;
  const currency = formData.get('currency') as 'USD' | 'VES' | 'EUR';
  const amount = formData.get('amount') as string;
  const notes = formData.get('notes') as string;

  const parseResult = recordDisbursementSchema.safeParse({
    date: new Date(dateStr),
    category,
    beneficiary,
    taxId,
    receiptNumber,
    sourceAccountId,
    expenseAccountId,
    currency,
    amount,
    notes,
  });

  if (!parseResult.success) {
    return { status: 'error', error: 'Datos de egreso operativo inválidos' };
  }

  const result = await recordDisbursement(parseResult.data);
  if (!result.ok) {
    return { status: 'error', error: result.error.kind };
  }

  revalidatePath('/accounting/expenses');
  revalidatePath('/accounting/journal-entries');
  revalidatePath('/accounting/trial-balance');
  return {
    status: 'success',
    message: `Egreso operativo #${result.value.disbursementNumber} registrado con éxito`,
    disbursementNumber: result.value.disbursementNumber,
  };
}
