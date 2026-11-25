import { z } from 'zod';
import { currencySchema, recordIdSchema } from './common';

export const withholdingTypeSchema = z.enum(['IVA_75', 'IVA_100', 'ISLR', 'US_1099_BACKUP']);
export type WithholdingType = z.infer<typeof withholdingTypeSchema>;

export const withholdingStatusSchema = z.enum(['ISSUED', 'DECLARED', 'VOID']);
export type WithholdingStatus = z.infer<typeof withholdingStatusSchema>;

export const issueWithholdingVoucherSchema = z
  .object({
    sourceDocumentId: recordIdSchema,
    documentNumber: z.string().trim().min(1).max(50),
    controlNumber: z.string().trim().max(50).optional(),
    supplierTaxId: z.string().trim().min(3).max(30),
    supplierName: z.string().trim().min(1).max(200),
    fiscalPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])(-Q[1-2])?$/),
    withholdingType: withholdingTypeSchema,
    taxableBaseMinor: z.string().regex(/^\d+$/),
    taxAmountMinor: z.string().regex(/^\d+$/),
    percentageBp: z.coerce.number().int().min(1).max(10000),
    currency: currencySchema.default('VES'),
  })
  .strict();
export type IssueWithholdingVoucherInput = z.infer<typeof issueWithholdingVoucherSchema>;

export const voidWithholdingVoucherSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type VoidWithholdingVoucherInput = z.infer<typeof voidWithholdingVoucherSchema>;

export const listWithholdingVouchersQuerySchema = z
  .object({
    fiscalPeriod: z.string().trim().optional(),
    supplierTaxId: z.string().trim().optional(),
    status: withholdingStatusSchema.optional(),
  })
  .strict();
export type ListWithholdingVouchersQueryInput = z.infer<typeof listWithholdingVouchersQuerySchema>;

export const withholdingVoucherResponseSchema = z.object({
  id: recordIdSchema,
  voucherNumber: z.string(),
  fiscalPeriod: z.string(),
  withholdingType: withholdingTypeSchema,
  sourceDocumentId: recordIdSchema,
  documentNumber: z.string(),
  controlNumber: z.string().nullable(),
  supplierTaxId: z.string(),
  supplierName: z.string(),
  taxableBaseMinor: z.string(),
  taxAmountMinor: z.string(),
  percentageBp: z.number(),
  withheldAmountMinor: z.string(),
  currency: currencySchema,
  status: withholdingStatusSchema,
  issuedAt: z.string().datetime(),
  declaredAt: z.string().datetime().nullable(),
  voidedAt: z.string().datetime().nullable(),
  voidReason: z.string().nullable(),
});
export type WithholdingVoucherResponse = z.infer<typeof withholdingVoucherResponseSchema>;
