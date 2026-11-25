import { z } from 'zod';
import { currencySchema, decimalStringSchema, recordIdSchema } from './common';

export const creditNoteReasonSchema = z.enum([
  'RETURN',
  'PRICE_CORRECTION',
  'DISCOUNT',
  'CANCELLATION',
  'OTHER',
]);
export type CreditNoteReason = z.infer<typeof creditNoteReasonSchema>;

export const creditNoteLineInputSchema = z
  .object({
    description: z.string().trim().min(1).max(255),
    quantity: decimalStringSchema,
    unitPrice: decimalStringSchema,
    taxPercentage: z.coerce.number().min(0).max(100).default(16),
    productId: recordIdSchema.optional(),
  })
  .strict();
export type CreditNoteLineInput = z.infer<typeof creditNoteLineInputSchema>;

export const issueCreditNoteSchema = z
  .object({
    affectedInvoiceId: recordIdSchema,
    creditNoteNumber: z.string().trim().min(1).max(50),
    controlNumber: z.string().trim().max(50).optional(),
    reason: creditNoteReasonSchema,
    reasonDetails: z.string().trim().max(500).optional(),
    issueDate: z.coerce.date(),
    restockItems: z.boolean().default(false),
    warehouseId: recordIdSchema.optional(),
    lines: z.array(creditNoteLineInputSchema).min(1),
  })
  .strict();
export type IssueCreditNoteInput = z.infer<typeof issueCreditNoteSchema>;

export const listCreditNotesQuerySchema = z
  .object({
    affectedInvoiceId: recordIdSchema.optional(),
    customerId: recordIdSchema.optional(),
  })
  .strict();
export type ListCreditNotesQueryInput = z.infer<typeof listCreditNotesQuerySchema>;

export const creditNoteResponseSchema = z.object({
  id: recordIdSchema,
  creditNoteNumber: z.string(),
  controlNumber: z.string().nullable(),
  affectedInvoiceId: recordIdSchema,
  affectedDocumentNumber: z.string(),
  customerId: recordIdSchema,
  reason: creditNoteReasonSchema,
  reasonDetails: z.string().nullable(),
  issueDate: z.string().datetime(),
  currency: currencySchema,
  subtotalMinor: z.string(),
  taxTotalMinor: z.string(),
  totalMinor: z.string(),
  restockItems: z.boolean(),
  warehouseId: recordIdSchema.nullable(),
  lines: z.array(
    z.object({
      id: recordIdSchema,
      description: z.string(),
      quantity: decimalStringSchema,
      unitPriceMinor: z.string(),
      taxPercentage: z.number(),
      taxAmountMinor: z.string(),
      totalMinor: z.string(),
      productId: recordIdSchema.nullable(),
    }),
  ),
});
export type CreditNoteResponse = z.infer<typeof creditNoteResponseSchema>;
