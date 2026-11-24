'use server';

import { revalidatePath } from 'next/cache';
import {
  importBankStatement,
  matchReconciliation,
  recordBankAdjustment,
} from '@/api/reconciliation';
import {
  importBankStatementSchema,
  matchReconciliationSchema,
  recordBankAdjustmentSchema,
} from '@corebiz/contracts';

export interface ReconciliationActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly error?: string;
}

export async function importBankStatementAction(
  _prev: ReconciliationActionState,
  formData: FormData,
): Promise<ReconciliationActionState> {
  const bankAccountId = formData.get('bankAccountId') as string;
  const currency = formData.get('currency') as 'USD' | 'VES';
  const startDateStr = formData.get('startDate') as string;
  const endDateStr = formData.get('endDate') as string;
  const startingBalance = formData.get('startingBalance') as string;
  const endingBalance = formData.get('endingBalance') as string;
  const rawLinesJson = formData.get('linesJson') as string;

  let parsedLines: unknown;
  try {
    parsedLines = JSON.parse(rawLinesJson || '[]') as unknown;
  } catch {
    return { status: 'error', error: 'Formato JSON de líneas de extracto inválido' };
  }

  const parseResult = importBankStatementSchema.safeParse({
    bankAccountId,
    currency,
    startDate: new Date(startDateStr),
    endDate: new Date(endDateStr),
    startingBalance,
    endingBalance,
    lines: parsedLines,
  });

  if (!parseResult.success) {
    return { status: 'error', error: 'Datos de importación inválidos' };
  }

  const result = await importBankStatement(parseResult.data);
  if (!result.ok) {
    return { status: 'error', error: result.error.kind };
  }

  revalidatePath('/accounting/reconciliation');
  return { status: 'success', message: 'Estado de cuenta bancario importado con éxito' };
}

export async function matchReconciliationAction(
  _prev: ReconciliationActionState,
  formData: FormData,
): Promise<ReconciliationActionState> {
  const statementId = formData.get('statementId') as string;
  const statementLineId = formData.get('statementLineId') as string;
  const journalEntryId = formData.get('journalEntryId') as string;

  const parseResult = matchReconciliationSchema.safeParse({
    matches: [{ statementLineId, journalEntryId }],
  });

  if (!parseResult.success) {
    return { status: 'error', error: 'Datos de conciliación inválidos' };
  }

  const result = await matchReconciliation(statementId, parseResult.data);
  if (!result.ok) {
    return { status: 'error', error: result.error.kind };
  }

  revalidatePath('/accounting/reconciliation');
  return { status: 'success', message: 'Movimiento emparejado y conciliado' };
}

export async function recordBankAdjustmentAction(
  _prev: ReconciliationActionState,
  formData: FormData,
): Promise<ReconciliationActionState> {
  const statementId = formData.get('statementId') as string;
  const statementLineId = formData.get('statementLineId') as string;
  const counterpartAccountId = formData.get('counterpartAccountId') as string;
  const description = (formData.get('description') as string) || undefined;

  const parseResult = recordBankAdjustmentSchema.safeParse({
    statementLineId,
    counterpartAccountId,
    description,
  });

  if (!parseResult.success) {
    return { status: 'error', error: 'Datos de ajuste bancario inválidos' };
  }

  const result = await recordBankAdjustment(statementId, parseResult.data);
  if (!result.ok) {
    return { status: 'error', error: result.error.kind };
  }

  revalidatePath('/accounting/reconciliation');
  return { status: 'success', message: 'Ajuste contable generado y movimiento conciliado' };
}
