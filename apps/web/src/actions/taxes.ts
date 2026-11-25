'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createTaxRateConfig, setDefaultTaxRateConfig } from '@/api/fiscal';

const createTaxSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(2).max(100),
  ratePercent: z.coerce.number().min(0).max(100),
  jurisdiction: z.enum(['VE', 'US']).default('VE'),
  isDefault: z.boolean().default(false),
});

export async function createTaxRateAction(formData: FormData): Promise<void> {
  const rawRate = formData.get('ratePercent');
  const parsed = createTaxSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    ratePercent: typeof rawRate === 'string' ? rawRate.replace(',', '.') : '0',
    jurisdiction: formData.get('jurisdiction') ?? 'VE',
    isDefault: formData.has('isDefault'),
  });

  if (!parsed.success) return;

  await createTaxRateConfig({
    code: parsed.data.code,
    name: parsed.data.name,
    rateBp: Math.round(parsed.data.ratePercent * 100),
    jurisdiction: parsed.data.jurisdiction,
    isDefault: parsed.data.isDefault,
  });

  revalidatePath('/settings/taxes');
  revalidatePath('/invoicing/new');
}

export async function setDefaultTaxRateAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id.trim() === '') return;

  await setDefaultTaxRateConfig(id);
  revalidatePath('/settings/taxes');
  revalidatePath('/invoicing/new');
}
