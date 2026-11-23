import { z } from 'zod';
import { currencySchema, decimalStringSchema, recordIdSchema } from './common';

export const taxJurisdictionSchema = z.enum(['VE', 'US']);

export const rifSchema = z
  .string()
  .trim()
  .regex(/^[VEJGC]-?\d{8}-?\d$/i, 'InvalidRif');

export const einSchema = z
  .string()
  .trim()
  .regex(/^\d{2}-?\d{7}$/, 'InvalidEin');

export const taxProfileSchema = z
  .object({
    taxId: z.string().trim().min(3).max(30),
    isSpecialTaxpayer: z.boolean().default(false),
    isTaxExempt: z.boolean().default(false),
  })
  .strict();

export const calculateTaxesInputSchema = z
  .object({
    jurisdiction: taxJurisdictionSchema,
    currency: currencySchema,
    customerTaxProfile: taxProfileSchema,
    lines: z.array(
      z
        .object({
          lineId: recordIdSchema,
          baseAmount: decimalStringSchema,
          taxTypeCode: z.string().trim().min(1).max(20),
        })
        .strict(),
    ),
  })
  .strict();

export type TaxJurisdiction = z.infer<typeof taxJurisdictionSchema>;
export type TaxProfileInput = z.infer<typeof taxProfileSchema>;
export type CalculateTaxesInput = z.infer<typeof calculateTaxesInputSchema>;
