import { z } from 'zod';
import { currencySchema } from './common';

export const fiscalReportQuerySchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    currency: currencySchema.optional(),
  })
  .strict();

export type FiscalReportQueryInput = z.infer<typeof fiscalReportQuerySchema>;
