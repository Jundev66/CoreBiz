import { z } from 'zod';
import { recordIdSchema } from './common';

export const fiscalDocumentTypeSchema = z.enum([
  'INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'CONTROL_NUMBER',
]);
export type FiscalDocumentType = z.infer<typeof fiscalDocumentTypeSchema>;

export const fiscalSequenceStatusSchema = z.enum(['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'INACTIVE']);
export type FiscalSequenceStatus = z.infer<typeof fiscalSequenceStatusSchema>;

export const createFiscalSequenceRangeSchema = z
  .object({
    jurisdiction: z.enum(['VE', 'US', 'CO', 'DO']).default('VE'),
    documentType: fiscalDocumentTypeSchema,
    prefix: z.string().trim().max(20).default(''),
    fromNumber: z.string().regex(/^[1-9]\d*$/),
    toNumber: z.string().regex(/^[1-9]\d*$/),
    resolutionNumber: z.string().trim().max(100).optional(),
    resolutionDate: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    warningThreshold: z.coerce.number().int().min(1).max(10000).default(100),
  })
  .strict();
export type CreateFiscalSequenceRangeInput = z.infer<typeof createFiscalSequenceRangeSchema>;

export const fiscalSequenceRangeResponseSchema = z.object({
  id: recordIdSchema,
  jurisdiction: z.string(),
  documentType: fiscalDocumentTypeSchema,
  prefix: z.string(),
  fromNumber: z.string(),
  toNumber: z.string(),
  currentNumber: z.string(),
  remainingNumbers: z.string(),
  resolutionNumber: z.string().nullable(),
  resolutionDate: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  warningThreshold: z.number(),
  status: fiscalSequenceStatusSchema,
  isNearExhaustion: z.boolean(),
  isNearExpiration: z.boolean(),
});
export type FiscalSequenceRangeResponse = z.infer<typeof fiscalSequenceRangeResponseSchema>;
