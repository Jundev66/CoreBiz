import { z } from 'zod';
import { decimalStringSchema, recordIdSchema } from './common';

export const transferStatusSchema = z.enum(['DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED']);
export type TransferStatus = z.infer<typeof transferStatusSchema>;

export const transferLineSchema = z
  .object({
    productId: recordIdSchema,
    quantity: decimalStringSchema,
  })
  .strict();
export type TransferLineInput = z.infer<typeof transferLineSchema>;

export const initiateTransferSchema = z
  .object({
    sourceWarehouseId: recordIdSchema,
    destinationWarehouseId: recordIdSchema,
    notes: z.string().trim().max(500).optional(),
    lines: z.array(transferLineSchema).min(1),
  })
  .strict();
export type InitiateTransferInput = z.infer<typeof initiateTransferSchema>;

export const cancelTransferSchema = z
  .object({
    reason: z.string().trim().min(3).max(255),
  })
  .strict();
export type CancelTransferInput = z.infer<typeof cancelTransferSchema>;

export const transferResponseSchema = z.object({
  id: recordIdSchema,
  transferNumber: z.string(),
  sourceWarehouseId: recordIdSchema,
  destinationWarehouseId: recordIdSchema,
  status: transferStatusSchema,
  notes: z.string().nullable(),
  lines: z.array(transferLineSchema),
  initiatedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type TransferResponse = z.infer<typeof transferResponseSchema>;
