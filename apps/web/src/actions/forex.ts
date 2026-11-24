'use server';

import { revalidatePath } from 'next/cache';
import { runForexRevaluation } from '@/api/forex';
import { runForexRevaluationSchema } from '@corebiz/contracts';

export interface ForexActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly error?: string;
  readonly entryNumber?: string;
}

export async function runForexRevaluationAction(
  _prev: ForexActionState,
  formData: FormData,
): Promise<ForexActionState> {
  const functionalCurrency = formData.get('functionalCurrency') as 'USD' | 'VES';
  const revaluationDateStr = formData.get('revaluationDate') as string;
  const gainAccountId = formData.get('gainAccountId') as string;
  const lossAccountId = formData.get('lossAccountId') as string;
  const description = (formData.get('description') as string) || undefined;
  const rawPositionsJson = formData.get('positionsJson') as string;

  let parsedPositions: unknown;
  try {
    parsedPositions = JSON.parse(rawPositionsJson || '[]') as unknown;
  } catch {
    return { status: 'error', error: 'Formato de posiciones inválido' };
  }

  const parseResult = runForexRevaluationSchema.safeParse({
    functionalCurrency,
    revaluationDate: new Date(revaluationDateStr),
    gainAccountId,
    lossAccountId,
    description,
    positions: parsedPositions,
  });

  if (!parseResult.success) {
    return { status: 'error', error: 'Datos de reexpresión cambiaria inválidos' };
  }

  const result = await runForexRevaluation(parseResult.data);
  if (!result.ok) {
    return { status: 'error', error: result.error.kind };
  }

  revalidatePath('/accounting/forex');
  revalidatePath('/accounting/journal-entries');
  revalidatePath('/accounting/trial-balance');

  return {
    status: 'success',
    message: 'Asiento de ajuste por diferencia en cambio asentado exitosamente',
    entryNumber: result.value.entryNumber,
  };
}
