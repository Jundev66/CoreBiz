import { z } from 'zod';
import { recordIdSchema } from './common';

export const createWarehouseSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .toUpperCase()
      .regex(/^[A-Z0-9_-]+$/),
    name: z.string().trim().min(2).max(100),
    isDefault: z.boolean().default(false),
    address: z.string().trim().max(255).optional(),
  })
  .strict();
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const warehouseResponseSchema = z.object({
  id: recordIdSchema,
  code: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  address: z.string().nullable(),
});
export type WarehouseResponse = z.infer<typeof warehouseResponseSchema>;
