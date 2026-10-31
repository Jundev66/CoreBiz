import { z } from 'zod';
import { currencySchema, decimalStringSchema, recordIdSchema } from './common';

export const posRegisterStatusSchema = z.enum(['active', 'inactive']);
export type PosRegisterStatus = z.infer<typeof posRegisterStatusSchema>;

export const createPosRegisterSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,20}$/),
  })
  .strict();
export type CreatePosRegisterInput = z.infer<typeof createPosRegisterSchema>;

export const updatePosRegisterSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    status: posRegisterStatusSchema.optional(),
  })
  .strict();
export type UpdatePosRegisterInput = z.infer<typeof updatePosRegisterSchema>;

export const enrollDeviceSchema = z
  .object({
    installationId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    platform: z.string().trim().max(50).optional(),
    browser: z.string().trim().max(50).optional(),
    pairingCode: z.string().trim().min(6).max(32),
  })
  .strict();
export type EnrollDeviceInput = z.infer<typeof enrollDeviceSchema>;

export const enrollDeviceResponseSchema = z
  .object({
    deviceId: recordIdSchema,
    registerId: recordIdSchema,
    registerCode: z.string(),
    deviceToken: z.string(),
  })
  .strict();
export type EnrollDeviceResponse = z.infer<typeof enrollDeviceResponseSchema>;

export const openCashShiftSchema = z
  .object({
    shiftId: recordIdSchema,
    registerId: recordIdSchema,
    deviceId: recordIdSchema,
    initialFloatMinor: z.string().regex(/^\d+$/),
    currency: currencySchema,
    openExchangeRateBcv: z.string().optional(),
    openedAt: z.string().datetime(),
  })
  .passthrough();
export type OpenCashShiftInput = z.infer<typeof openCashShiftSchema>;

export const cashMovementTypeSchema = z.enum(['cash_in', 'cash_out']);
export type CashMovementType = z.infer<typeof cashMovementTypeSchema>;

export const recordCashMovementSchema = z
  .object({
    movementId: recordIdSchema,
    shiftId: recordIdSchema,
    type: cashMovementTypeSchema,
    amountMinor: z.string().regex(/^[1-9]\d*$/),
    reason: z.string().trim().min(1).max(200),
    occurredAt: z.string().datetime(),
  })
  .passthrough();
export type RecordCashMovementInput = z.infer<typeof recordCashMovementSchema>;

export const closeCashShiftSchema = z
  .object({
    shiftId: recordIdSchema,
    declaredCashMinor: z.string().regex(/^\d+$/),
    closedAt: z.string().datetime(),
    notes: z.string().trim().max(500).optional(),
    openExchangeRateBcv: z.string().optional(),
    closeExchangeRateBcv: z.string().optional(),
    rateAuditHistory: z.array(z.any()).optional(),
  })
  .passthrough();
export type CloseCashShiftInput = z.infer<typeof closeCashShiftSchema>;

export const posPaymentMethodSchema = z.enum(['cash', 'card', 'transfer', 'split']);
export type PosPaymentMethod = z.infer<typeof posPaymentMethodSchema>;

export const posSaleLineSchema = z
  .object({
    id: recordIdSchema,
    productId: recordIdSchema.nullable(),
    temporaryName: z.string().trim().max(200).nullable().optional(),
    barcodeScanned: z.string().trim().max(100).nullable().optional(),
    quantity: decimalStringSchema,
    unitPriceMinor: z.string().regex(/^\d+$/),
  })
  .passthrough();
export type PosSaleLineInput = z.infer<typeof posSaleLineSchema>;

export const issuePosSaleSchema = z
  .object({
    saleId: recordIdSchema,
    operationId: z.string().uuid(),
    registerId: recordIdSchema,
    deviceId: recordIdSchema,
    shiftId: recordIdSchema,
    ticketNumber: z.string().trim().min(3).max(50),
    invoiceControlNumber: z.string().optional(),
    customerName: z.string().optional(),
    customerDoc: z.string().optional(),
    exchangeRateBcv: z.string().optional(),
    paymentMethod: posPaymentMethodSchema,
    lines: z.array(posSaleLineSchema).min(1),
    occurredAt: z.string().datetime(),
  })
  .passthrough();
export type IssuePosSaleInput = z.infer<typeof issuePosSaleSchema>;

export const posSyncOperationTypeSchema = z.enum([
  'shift.open',
  'sale.issue',
  'cash.movement',
  'shift.close',
]);
export type PosSyncOperationType = z.infer<typeof posSyncOperationTypeSchema>;

export const posSyncOperationSchema = z
  .object({
    operationId: z.string().uuid(),
    type: posSyncOperationTypeSchema,
    sequence: z.number().int().nonnegative(),
    payloadHash: z.string().length(64),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type PosSyncOperationInput = z.infer<typeof posSyncOperationSchema>;

export const posSyncBatchSchema = z
  .object({
    deviceId: recordIdSchema,
    operations: z.array(posSyncOperationSchema).min(1).max(200),
  })
  .strict();
export type PosSyncBatchInput = z.infer<typeof posSyncBatchSchema>;

export const posSyncItemResultSchema = z
  .object({
    operationId: z.string().uuid(),
    status: z.enum(['processed', 'duplicate', 'failed', 'enqueued']),
    error: z.string().optional(),
    conflictId: recordIdSchema.optional(),
  })
  .strict();
export type PosSyncItemResult = z.infer<typeof posSyncItemResultSchema>;

export const posSyncBatchResponseSchema = z
  .object({
    results: z.array(posSyncItemResultSchema),
    syncedAt: z.string().datetime(),
  })
  .strict();
export type PosSyncBatchResponse = z.infer<typeof posSyncBatchResponseSchema>;

export const resolveConflictSchema = z
  .object({
    resolutionType: z.enum([
      'adjustment_in',
      'catalog_created',
      'linked_existing',
      'dismissed_known',
    ]),
    notes: z.string().trim().min(3).max(1000),
    linkedProductId: recordIdSchema.optional(),
  })
  .strict();
export type ResolveConflictInput = z.infer<typeof resolveConflictSchema>;

export const catalogDeltaQuerySchema = z
  .object({
    since: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(500),
  })
  .strict();
export type CatalogDeltaQuery = z.infer<typeof catalogDeltaQuerySchema>;
