import { z } from 'zod';
import { currencySchema, decimalStringSchema, recordIdSchema } from './common';

export const paymentConditionSchema = z.enum(['CASH', 'CREDIT']);
export type PaymentCondition = z.infer<typeof paymentConditionSchema>;

export const paymentMethodTypeSchema = z.enum([
  'CASH_USD',
  'CASH_VES',
  'BANK_TRANSFER',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'MOBILE_PAY',
  'ZELLE',
  'OTHER',
]);
export type PaymentMethodType = z.infer<typeof paymentMethodTypeSchema>;

export const receiptStatusSchema = z.enum(['ACTIVE', 'VOIDED']);
export type ReceiptStatus = z.infer<typeof receiptStatusSchema>;

export const paymentReceiptAllocationSchema = z
  .object({
    invoiceId: recordIdSchema,
    amount: decimalStringSchema,
  })
  .strict();
export type PaymentReceiptAllocationInput = z.infer<typeof paymentReceiptAllocationSchema>;

export const createCollectionReceiptSchema = z
  .object({
    customerId: recordIdSchema,
    amount: decimalStringSchema,
    currency: currencySchema,
    paymentMethod: paymentMethodTypeSchema,
    bankAccountId: recordIdSchema,
    receiptDate: z.coerce.date(),
    reference: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
    allocations: z.array(paymentReceiptAllocationSchema).min(1),
  })
  .strict();
export type CreateCollectionReceiptInput = z.infer<typeof createCollectionReceiptSchema>;

export const voidCollectionReceiptSchema = z
  .object({
    reason: z.string().trim().min(3).max(255),
  })
  .strict();
export type VoidCollectionReceiptInput = z.infer<typeof voidCollectionReceiptSchema>;

export const paymentReceiptAllocationResponseSchema = z.object({
  invoiceId: recordIdSchema,
  amount: decimalStringSchema,
  previousBalance: decimalStringSchema,
  newBalance: decimalStringSchema,
});
export type PaymentReceiptAllocationResponse = z.infer<
  typeof paymentReceiptAllocationResponseSchema
>;

export const paymentReceiptResponseSchema = z.object({
  id: recordIdSchema,
  receiptNumber: z.string(),
  customerId: recordIdSchema,
  amount: decimalStringSchema,
  currency: currencySchema,
  paymentMethod: paymentMethodTypeSchema,
  bankAccountId: recordIdSchema,
  receiptDate: z.string().datetime(),
  reference: z.string().nullable(),
  status: receiptStatusSchema,
  notes: z.string().nullable(),
  allocations: z.array(paymentReceiptAllocationResponseSchema),
});
export type PaymentReceiptResponse = z.infer<typeof paymentReceiptResponseSchema>;
