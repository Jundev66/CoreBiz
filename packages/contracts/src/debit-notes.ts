import { z } from 'zod';
import { currencySchema, decimalStringSchema, recordIdSchema } from './common';

export const debitNoteReasonSchema = z.enum([
  'INTEREST',
  'PRICE_CORRECTION',
  'ADDITIONAL_CHARGE',
  'OTHER',
]);
export type DebitNoteReason = z.infer<typeof debitNoteReasonSchema>;

export const debitNoteLineInputSchema = z
  .object({
    description: z.string().trim().min(1).max(255),
    quantity: decimalStringSchema,
    unitPrice: decimalStringSchema,
    taxPercentage: z.coerce.number().min(0).max(100).default(16),
  })
  .strict();
export type DebitNoteLineInput = z.infer<typeof debitNoteLineInputSchema>;

export const issueDebitNoteSchema = z
  .object({
    affectedInvoiceId: recordIdSchema,
    debitNoteNumber: z.string().trim().min(1).max(50),
    controlNumber: z.string().trim().max(50).optional(),
    reason: debitNoteReasonSchema,
    reasonDetails: z.string().trim().max(500).optional(),
    issueDate: z.coerce.date(),
    revenueAccountId: recordIdSchema.optional(),
    lines: z.array(debitNoteLineInputSchema).min(1),
  })
  .strict();
export type IssueDebitNoteInput = z.infer<typeof issueDebitNoteSchema>;

export const listDebitNotesQuerySchema = z
  .object({
    affectedInvoiceId: recordIdSchema.optional(),
    customerId: recordIdSchema.optional(),
  })
  .strict();
export type ListDebitNotesQueryInput = z.infer<typeof listDebitNotesQuerySchema>;

export const debitNoteResponseSchema = z.object({
  id: recordIdSchema,
  debitNoteNumber: z.string(),
  controlNumber: z.string().nullable(),
  affectedInvoiceId: recordIdSchema,
  affectedDocumentNumber: z.string(),
  customerId: recordIdSchema,
  reason: debitNoteReasonSchema,
  reasonDetails: z.string().nullable(),
  issueDate: z.string().datetime(),
  currency: currencySchema,
  subtotalMinor: z.string(),
  taxTotalMinor: z.string(),
  totalMinor: z.string(),
  lines: z.array(
    z.object({
      id: recordIdSchema,
      description: z.string(),
      quantity: decimalStringSchema,
      unitPriceMinor: z.string(),
      taxPercentage: z.number(),
      taxAmountMinor: z.string(),
      totalMinor: z.string(),
    }),
  ),
});
export type DebitNoteResponse = z.infer<typeof debitNoteResponseSchema>;
