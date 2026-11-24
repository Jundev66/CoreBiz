import { z } from 'zod';

export const bankStatementLineInputSchema = z.object({
  id: z.string().min(1),
  lineType: z.enum(['DEBIT', 'CREDIT']),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  transactionDate: z.coerce.date(),
  reference: z.string().min(1),
  description: z.string().min(1),
});

export const importBankStatementSchema = z.object({
  bankAccountId: z.string().min(1),
  currency: z.enum(['USD', 'VES']),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  startingBalance: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
  endingBalance: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
  lines: z.array(bankStatementLineInputSchema),
});

export const matchReconciliationSchema = z.object({
  matches: z
    .array(
      z.object({
        statementLineId: z.string().min(1),
        journalEntryId: z.string().min(1),
        journalEntryLineId: z.string().optional(),
      }),
    )
    .min(1),
});

export const recordBankAdjustmentSchema = z.object({
  statementLineId: z.string().min(1),
  counterpartAccountId: z.string().min(1),
  description: z.string().optional(),
});

export const listBankStatementsQuerySchema = z.object({
  bankAccountId: z.string().optional(),
});

export type BankStatementLineInputDto = z.infer<typeof bankStatementLineInputSchema>;
export type ImportBankStatementDto = z.infer<typeof importBankStatementSchema>;
export type MatchReconciliationDto = z.infer<typeof matchReconciliationSchema>;
export type RecordBankAdjustmentDto = z.infer<typeof recordBankAdjustmentSchema>;
export type ListBankStatementsQueryDto = z.infer<typeof listBankStatementsQuerySchema>;
