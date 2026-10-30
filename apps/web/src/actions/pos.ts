'use server';

import { revalidatePath } from 'next/cache';
import { send } from '@/api/client';
import { toFormFailure } from '@/api/failure';
import type { ActionState } from './customers';

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function resolveConflictAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const conflictId = field(formData, 'conflictId');
  const resolutionType = field(formData, 'resolutionType');
  const notes = field(formData, 'notes');

  const result = await send<{ readonly id: string; readonly status: string }>(
    'POST',
    `/v1/pos/conflicts/${encodeURIComponent(conflictId)}/resolve`,
    {
      resolutionType,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    },
  );

  if (!result.ok) {
    return toFormFailure(result.error);
  }

  revalidatePath('/conflicts');
  revalidatePath('/products');
  return { status: 'success', createdCode: result.value.id };
}
