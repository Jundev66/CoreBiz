'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createAccount } from '@/api/accounting';
import { accountMappingCookieName } from '@/api/accounting-mapping';
import { apiForRequest } from '@/api/session';
import { toFormFailure } from '@/api/failure';

export interface AccountActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly errorKind?: string;
  readonly createdCode?: string;
}

const createAccountFormSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(2).max(100),
  category: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE']),
  parentId: z.string().trim().optional(),
  isReconcilable: z.boolean().default(false),
});

export async function createAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = createAccountFormSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    category: formData.get('category'),
    parentId: formData.get('parentId') || undefined,
    isReconcilable: formData.has('isReconcilable'),
  });

  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat' };
  }

  const result = await createAccount({
    code: parsed.data.code,
    name: parsed.data.name,
    category: parsed.data.category,
    ...(parsed.data.parentId ? { parentId: parsed.data.parentId } : {}),
    isReconcilable: parsed.data.isReconcilable,
  });

  if (!result.ok) {
    const failure = toFormFailure(result.error);
    return {
      status: 'error',
      errorKind: failure.errorKind ?? 'Unexpected',
    };
  }

  revalidatePath('/accounting');
  revalidatePath('/settings/accounting');
  revalidatePath('/products');
  return { status: 'success', createdCode: result.value.code };
}

const mappingSchema = z.object({
  cashAccountId: z.string().trim().min(1),
  receivableAccountId: z.string().trim().min(1),
  inventoryAccountId: z.string().trim().min(1),
  payableAccountId: z.string().trim().min(1),
  taxPayableAccountId: z.string().trim().min(1),
  taxCreditAccountId: z.string().trim().min(1),
  revenueAccountId: z.string().trim().min(1),
  cogsAccountId: z.string().trim().min(1),
});

export async function saveCompanyAccountMappingAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = mappingSchema.safeParse({
    cashAccountId: formData.get('cashAccountId'),
    receivableAccountId: formData.get('receivableAccountId'),
    inventoryAccountId: formData.get('inventoryAccountId'),
    payableAccountId: formData.get('payableAccountId'),
    taxPayableAccountId: formData.get('taxPayableAccountId'),
    taxCreditAccountId: formData.get('taxCreditAccountId'),
    revenueAccountId: formData.get('revenueAccountId'),
    cogsAccountId: formData.get('cogsAccountId'),
  });

  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat' };
  }

  const { ctx } = await apiForRequest();
  const store = await cookies();
  store.set(accountMappingCookieName(ctx.tenantId), JSON.stringify(parsed.data), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/settings/accounting');
  revalidatePath('/invoicing/new');
  revalidatePath('/purchases/new');
  return { status: 'success' };
}
