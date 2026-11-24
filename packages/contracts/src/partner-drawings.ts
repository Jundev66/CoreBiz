import { z } from 'zod';

export const recordPartnerCashDrawingSchema = z.object({
  date: z.coerce.date(),
  partnerId: z.string().min(1),
  partnerName: z.string().min(1),
  drawingAccountId: z.string().min(1),
  cashAccountId: z.string().min(1),
  currency: z.enum(['USD', 'VES', 'EUR']),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  notes: z.string().min(1),
});

export const recordPartnerStockDrawingSchema = z.object({
  date: z.coerce.date(),
  partnerId: z.string().min(1),
  partnerName: z.string().min(1),
  drawingAccountId: z.string().min(1),
  inventoryAccountId: z.string().min(1),
  currency: z.enum(['USD', 'VES', 'EUR']),
  productId: z.string().min(1),
  quantity: z.number().positive(),
  unitCost: z.string().regex(/^\d+(\.\d{1,4})?$/),
  notes: z.string().min(1),
});

export const partnerDrawingResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  drawingNumber: z.string(),
  drawingType: z.enum(['CASH', 'STOCK']),
  date: z.string(),
  partnerId: z.string(),
  partnerName: z.string(),
  drawingAccountId: z.string(),
  creditAccountId: z.string(),
  currency: z.enum(['USD', 'VES', 'EUR']),
  amount: z.string(),
  productId: z.string().optional(),
  quantity: z.number().optional(),
  unitCost: z.string().optional(),
  operatorUserId: z.string(),
  notes: z.string(),
  journalEntryId: z.string(),
  status: z.enum(['COMPLETED', 'CANCELLED']),
  createdAt: z.string(),
});

export type RecordPartnerCashDrawingDto = z.infer<typeof recordPartnerCashDrawingSchema>;
export type RecordPartnerStockDrawingDto = z.infer<typeof recordPartnerStockDrawingSchema>;
export type PartnerDrawingResponseDto = z.infer<typeof partnerDrawingResponseSchema>;
