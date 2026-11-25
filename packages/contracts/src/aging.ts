import { z } from 'zod';
import { currencySchema, recordIdSchema } from './common';

export const agingBucketSchema = z.enum([
  'CURRENT',
  'DAYS_1_30',
  'DAYS_31_60',
  'DAYS_61_90',
  'DAYS_90_PLUS',
]);
export type AgingBucket = z.infer<typeof agingBucketSchema>;

export const agingDirectionSchema = z.enum(['RECEIVABLE', 'PAYABLE']);
export type AgingDirection = z.infer<typeof agingDirectionSchema>;

export const agingDocumentItemSchema = z.object({
  documentId: recordIdSchema,
  documentNumber: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  daysOverdue: z.number().int(),
  bucket: agingBucketSchema,
  totalMinor: z.string(),
  paidMinor: z.string(),
  remainingMinor: z.string(),
  currency: currencySchema,
});
export type AgingDocumentItem = z.infer<typeof agingDocumentItemSchema>;

export const partnerAgingSummarySchema = z.object({
  entityId: recordIdSchema,
  entityName: z.string(),
  taxId: z.string().nullable().optional(),
  totalOpenMinor: z.string(),
  currentMinor: z.string(),
  days1To30Minor: z.string(),
  days31To60Minor: z.string(),
  days61To90Minor: z.string(),
  days90PlusMinor: z.string(),
  currency: currencySchema,
  documents: z.array(agingDocumentItemSchema).optional(),
});
export type PartnerAgingSummary = z.infer<typeof partnerAgingSummarySchema>;

export const agingReportResponseSchema = z.object({
  direction: agingDirectionSchema,
  asOfDate: z.string(),
  currency: currencySchema,
  totalOpenMinor: z.string(),
  totalCurrentMinor: z.string(),
  totalDays1To30Minor: z.string(),
  totalDays31To60Minor: z.string(),
  totalDays61To90Minor: z.string(),
  totalDays90PlusMinor: z.string(),
  partners: z.array(partnerAgingSummarySchema),
});
export type AgingReportResponse = z.infer<typeof agingReportResponseSchema>;

export const getArAgingQuerySchema = z.object({
  asOfDate: z.string().optional(),
  customerId: recordIdSchema.optional(),
  currency: currencySchema.optional(),
});
export type GetArAgingQueryInput = z.infer<typeof getArAgingQuerySchema>;

export const getApAgingQuerySchema = z.object({
  asOfDate: z.string().optional(),
  supplierId: recordIdSchema.optional(),
  currency: currencySchema.optional(),
});
export type GetApAgingQueryInput = z.infer<typeof getApAgingQuerySchema>;
