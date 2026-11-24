import { z } from 'zod';

export const forexPositionInputSchema = z.object({
  accountId: z.string().min(1),
  accountCode: z.string().min(1),
  accountName: z.string().min(1),
  positionType: z.enum(['ASSET', 'LIABILITY']),
  foreignCurrency: z.enum(['USD', 'VES']),
  foreignAmount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  historicalRate: z.string().regex(/^\d+(\.\d{1,8})?$/),
  closingRate: z.string().regex(/^\d+(\.\d{1,8})?$/),
});

export const runForexRevaluationSchema = z.object({
  revaluationDate: z.coerce.date(),
  functionalCurrency: z.enum(['USD', 'VES']),
  gainAccountId: z.string().min(1),
  lossAccountId: z.string().min(1),
  description: z.string().optional(),
  positions: z.array(forexPositionInputSchema).min(1),
});

export const getForexExposureQuerySchema = z.object({
  functionalCurrency: z.enum(['USD', 'VES']).default('VES'),
  foreignCurrency: z.enum(['USD', 'VES']).default('USD'),
  currentRate: z.string().regex(/^\d+(\.\d{1,8})?$/),
  closingRate: z.string().regex(/^\d+(\.\d{1,8})?$/),
});

export type ForexPositionInputDto = z.infer<typeof forexPositionInputSchema>;
export type RunForexRevaluationDto = z.infer<typeof runForexRevaluationSchema>;
export type GetForexExposureQueryDto = z.infer<typeof getForexExposureQuerySchema>;
