import { z } from 'zod';

export const disbursementCategorySchema = z.enum([
  'LOGISTICS',
  'UTILITIES_RENT',
  'SUPPLIES',
  'MAINTENANCE',
  'CUSTOMS_DUTIES',
  'SERVICES',
  'GENERAL',
]);

export const recordDisbursementSchema = z.object({
  date: z.coerce.date(),
  category: disbursementCategorySchema,
  beneficiary: z.string().min(1),
  taxId: z.string().optional(),
  receiptNumber: z.string().optional(),
  sourceAccountId: z.string().min(1),
  expenseAccountId: z.string().min(1),
  currency: z.enum(['USD', 'VES', 'EUR']),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  notes: z.string().min(1),
});

export const listDisbursementsQuerySchema = z.object({
  category: disbursementCategorySchema.optional(),
});

export const disbursementResponseSchema = z.object({
  id: z.string(),
  disbursementNumber: z.string(),
  date: z.string(),
  category: disbursementCategorySchema,
  beneficiary: z.string(),
  taxId: z.string().optional(),
  receiptNumber: z.string().optional(),
  sourceAccountId: z.string(),
  expenseAccountId: z.string(),
  currency: z.string(),
  amount: z.string(),
  amountMinor: z.string(),
  notes: z.string(),
  journalEntryId: z.string(),
  createdAt: z.string(),
});

export type RecordDisbursementDto = z.infer<typeof recordDisbursementSchema>;
export type ListDisbursementsQueryDto = z.infer<typeof listDisbursementsQuerySchema>;
export type DisbursementResponseDto = z.infer<typeof disbursementResponseSchema>;
export type DisbursementCategoryDto = z.infer<typeof disbursementCategorySchema>;
