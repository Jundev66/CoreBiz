import { z } from 'zod';
import { currencySchema, decimalStringSchema, recordIdSchema } from './common';

export const accountCategorySchema = z.enum([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'COGS',
  'EXPENSE',
]);

export const accountCodeSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)*$/, 'InvalidAccountCode');

export const createAccountSchema = z
  .object({
    code: accountCodeSchema,
    name: z.string().trim().min(2).max(100),
    category: accountCategorySchema,
    parentId: recordIdSchema.optional(),
    isReconcilable: z.boolean().default(false),
  })
  .strict();

export const journalEntryLineInputSchema = z
  .object({
    accountId: recordIdSchema,
    debitAmount: decimalStringSchema.default('0'),
    creditAmount: decimalStringSchema.default('0'),
    currency: currencySchema,
    memo: z.string().trim().max(255).optional(),
  })
  .strict();

export const postJournalEntrySchema = z
  .object({
    date: z.coerce.date(),
    description: z.string().trim().min(3).max(500),
    sourceType: z.enum(['INVOICE', 'PAYMENT', 'MANUAL', 'ADJUSTMENT']),
    sourceId: recordIdSchema.optional(),
    lines: z.array(journalEntryLineInputSchema).min(2),
  })
  .strict();

export const getTrialBalanceQuerySchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    currency: currencySchema,
  })
  .strict();

export const listAccountsQuerySchema = z
  .object({
    fiscalCountry: z.string().trim().max(10).optional(),
  })
  .strict();

export const listJournalEntriesQuerySchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .strict();

export type AccountCategory = z.infer<typeof accountCategorySchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type PostJournalEntryInput = z.infer<typeof postJournalEntrySchema>;
export type GetTrialBalanceInput = z.infer<typeof getTrialBalanceQuerySchema>;
export type ListAccountsQueryInput = z.infer<typeof listAccountsQuerySchema>;
export type ListJournalEntriesQueryInput = z.infer<typeof listJournalEntriesQuerySchema>;
