import { z } from 'zod';

export const executeTreasurySwapSchema = z.object({
  date: z.coerce.date(),
  sourceAccountId: z.string().min(1),
  sourceCurrency: z.enum(['USD', 'VES', 'EUR']),
  sourceAmount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  targetAccountId: z.string().min(1),
  targetCurrency: z.enum(['USD', 'VES', 'EUR']),
  targetAmount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  feeAccountId: z.string().min(1),
  feeAmount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .default('0'),
  exchangeRate: z.string().regex(/^\d+(\.\d{1,8})?$/),
  counterpartyReference: z.string().min(1),
  description: z.string().optional(),
});

export const treasurySwapResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  swapNumber: z.string(),
  date: z.string(),
  sourceAccountId: z.string(),
  sourceCurrency: z.enum(['USD', 'VES', 'EUR']),
  sourceAmount: z.string(),
  targetAccountId: z.string(),
  targetCurrency: z.enum(['USD', 'VES', 'EUR']),
  targetAmount: z.string(),
  feeAccountId: z.string(),
  feeAmount: z.string(),
  exchangeRate: z.string(),
  counterpartyReference: z.string(),
  operatorUserId: z.string(),
  description: z.string(),
  journalEntryId: z.string(),
  status: z.enum(['COMPLETED', 'CANCELLED']),
  createdAt: z.string(),
});

export type ExecuteTreasurySwapDto = z.infer<typeof executeTreasurySwapSchema>;
export type TreasurySwapResponseDto = z.infer<typeof treasurySwapResponseSchema>;
