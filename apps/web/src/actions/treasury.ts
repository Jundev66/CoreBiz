'use server';

import { revalidatePath } from 'next/cache';
import { executeTreasurySwap } from '@/api/treasury';
import { executeTreasurySwapSchema } from '@corebiz/contracts';

export interface TreasurySwapActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly error?: string;
  readonly swapNumber?: string;
}

export async function executeTreasurySwapAction(
  _prev: TreasurySwapActionState,
  formData: FormData,
): Promise<TreasurySwapActionState> {
  const dateStr = formData.get('date') as string;
  const sourceAccountId = formData.get('sourceAccountId') as string;
  const sourceCurrency = formData.get('sourceCurrency') as 'USD' | 'VES';
  const sourceAmount = formData.get('sourceAmount') as string;
  const targetAccountId = formData.get('targetAccountId') as string;
  const targetCurrency = formData.get('targetCurrency') as 'USD' | 'VES';
  const targetAmount = formData.get('targetAmount') as string;
  const feeAccountId = formData.get('feeAccountId') as string;
  const feeAmount = (formData.get('feeAmount') as string) || '0';
  const exchangeRate = formData.get('exchangeRate') as string;
  const counterpartyReference = formData.get('counterpartyReference') as string;
  const description = (formData.get('description') as string) || undefined;

  const parseResult = executeTreasurySwapSchema.safeParse({
    date: new Date(dateStr),
    sourceAccountId,
    sourceCurrency,
    sourceAmount,
    targetAccountId,
    targetCurrency,
    targetAmount,
    feeAccountId,
    feeAmount,
    exchangeRate,
    counterpartyReference,
    description,
  });

  if (!parseResult.success) {
    return { status: 'error', error: 'Datos de la operación de tesorería inválidos' };
  }

  const result = await executeTreasurySwap(parseResult.data);
  if (!result.ok) {
    return { status: 'error', error: result.error.kind };
  }

  revalidatePath('/accounting/treasury');
  return {
    status: 'success',
    message: `Operación #${result.value.swapNumber} ejecutada exitosamente`,
    swapNumber: result.value.swapNumber,
  };
}
