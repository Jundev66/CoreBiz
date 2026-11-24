import { z } from 'zod';
import { currencySchema, decimalStringSchema, recordIdSchema } from './common';
import { invoiceTypeSchema } from './invoicing';

export const integrationInvoiceLineSchema = z
  .object({
    description: z.string().trim().min(1).max(255),
    quantity: decimalStringSchema,
    unitPrice: decimalStringSchema,
    taxPercentage: z.coerce.number().min(0).max(100).default(16),
    productId: recordIdSchema.optional(),
  })
  .strict();

export const integrationInvoiceSchema = z
  .object({
    customerId: recordIdSchema,
    documentType: invoiceTypeSchema.default('STANDARD'),
    documentNumber: z.string().trim().min(1).max(50),
    controlNumber: z.string().trim().max(50).optional(),
    issueDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    currency: currencySchema.default('USD'),
    receivableAccountId: recordIdSchema.optional(),
    revenueAccountId: recordIdSchema.optional(),
    taxPayableAccountId: recordIdSchema.optional(),
    lines: z.array(integrationInvoiceLineSchema).min(1),
  })
  .strict();

export const integrationJournalEntryLineSchema = z
  .object({
    accountId: recordIdSchema,
    debitMinor: decimalStringSchema.default('0'),
    creditMinor: decimalStringSchema.default('0'),
    description: z.string().trim().max(255).optional(),
  })
  .strict();

export const integrationJournalEntrySchema = z
  .object({
    date: z.coerce.date(),
    description: z.string().trim().min(1).max(255),
    reference: z.string().trim().max(100).optional(),
    currency: currencySchema.default('USD'),
    lines: z.array(integrationJournalEntryLineSchema).min(2),
  })
  .strict();

export type IntegrationInvoiceLineInput = z.infer<typeof integrationInvoiceLineSchema>;
export type IntegrationInvoiceInput = z.infer<typeof integrationInvoiceSchema>;
export type IntegrationJournalEntryLineInput = z.infer<typeof integrationJournalEntryLineSchema>;
export type IntegrationJournalEntryInput = z.infer<typeof integrationJournalEntrySchema>;
