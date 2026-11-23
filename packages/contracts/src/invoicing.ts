import { z } from 'zod';
import { currencySchema, decimalStringSchema, recordIdSchema } from './common';

export const invoiceTypeSchema = z.enum(['STANDARD', 'CREDIT_NOTE', 'DEBIT_NOTE', 'EXPORT']);

export const invoiceStatusSchema = z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']);

export const issueInvoiceLineSchema = z
  .object({
    description: z.string().trim().min(1).max(255),
    quantity: decimalStringSchema,
    unitPrice: decimalStringSchema,
    taxPercentage: z.coerce.number().min(0).max(100).default(16),
    productId: recordIdSchema.optional(),
  })
  .strict();

export const issueInvoiceSchema = z
  .object({
    customerId: recordIdSchema,
    documentType: invoiceTypeSchema.default('STANDARD'),
    documentNumber: z.string().trim().min(1).max(50),
    controlNumber: z.string().trim().max(50).optional(),
    issueDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    currency: currencySchema,
    receivableAccountId: recordIdSchema,
    revenueAccountId: recordIdSchema,
    taxPayableAccountId: recordIdSchema,
    lines: z.array(issueInvoiceLineSchema).min(1),
  })
  .strict();

export const applyInvoicePaymentSchema = z
  .object({
    invoiceId: recordIdSchema,
    amount: decimalStringSchema,
    currency: currencySchema,
    paymentDate: z.coerce.date(),
    cashAccountId: recordIdSchema,
    receivableAccountId: recordIdSchema,
    reference: z.string().trim().max(100).optional(),
  })
  .strict();

export type InvoiceType = z.infer<typeof invoiceTypeSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type IssueInvoiceLineInput = z.infer<typeof issueInvoiceLineSchema>;
export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>;
export type ApplyInvoicePaymentInput = z.infer<typeof applyInvoicePaymentSchema>;
