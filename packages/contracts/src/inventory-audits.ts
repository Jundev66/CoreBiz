import { z } from 'zod';
import { currencySchema, decimalStringSchema, recordIdSchema } from './common';

export const auditStatusSchema = z.enum(['OPEN', 'IN_REVIEW', 'APPROVED', 'CANCELLED']);
export type AuditStatus = z.infer<typeof auditStatusSchema>;

export const auditLineInputSchema = z
  .object({
    productId: recordIdSchema,
    theoreticalQuantity: decimalStringSchema.optional(),
    unitCostMinor: z.string().regex(/^\d+$/).default('0'),
    currency: currencySchema.default('USD'),
  })
  .strict();
export type AuditLineInput = z.infer<typeof auditLineInputSchema>;

export const createInventoryAuditSchema = z
  .object({
    warehouseId: recordIdSchema,
    blindCount: z.boolean().default(false),
    notes: z.string().trim().max(500).optional(),
    lines: z.array(auditLineInputSchema).min(1),
  })
  .strict();
export type CreateInventoryAuditInput = z.infer<typeof createInventoryAuditSchema>;

export const auditCountItemSchema = z
  .object({
    productId: recordIdSchema,
    countedQuantity: decimalStringSchema,
  })
  .strict();
export type AuditCountItem = z.infer<typeof auditCountItemSchema>;

export const recordAuditCountsSchema = z
  .object({
    counts: z.array(auditCountItemSchema).min(1),
  })
  .strict();
export type RecordAuditCountsInput = z.infer<typeof recordAuditCountsSchema>;

export const approveInventoryAuditSchema = z
  .object({
    notes: z.string().trim().max(500).optional(),
    shrinkageExpenseAccountId: z.string().trim().optional(),
    inventoryAssetAccountId: z.string().trim().optional(),
    surplusIncomeAccountId: z.string().trim().optional(),
  })
  .strict();
export type ApproveInventoryAuditInput = z.infer<typeof approveInventoryAuditSchema>;

export const cancelInventoryAuditSchema = z
  .object({
    reason: z.string().trim().min(3).max(255),
  })
  .strict();
export type CancelInventoryAuditInput = z.infer<typeof cancelInventoryAuditSchema>;

export const auditLineResponseSchema = z.object({
  productId: recordIdSchema,
  theoreticalQuantity: decimalStringSchema.nullable(),
  countedQuantity: decimalStringSchema.nullable(),
  discrepancyQuantity: decimalStringSchema.nullable(),
  unitCostMinor: z.string(),
  discrepancyMonetaryValueMinor: z.string().nullable(),
  currency: currencySchema,
});
export type AuditLineResponse = z.infer<typeof auditLineResponseSchema>;

export const inventoryAuditResponseSchema = z.object({
  id: recordIdSchema,
  auditNumber: z.string(),
  warehouseId: recordIdSchema,
  blindCount: z.boolean(),
  status: auditStatusSchema,
  notes: z.string().nullable(),
  lines: z.array(auditLineResponseSchema),
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
  approvedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
  journalEntryId: z.string().nullable(),
});
export type InventoryAuditResponse = z.infer<typeof inventoryAuditResponseSchema>;
