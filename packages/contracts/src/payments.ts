import { z } from 'zod';
import { decimalStringSchema, recordIdSchema } from './common';

export const paymentMethodSchema = z.enum([
  'cash_usd',
  'cash_ves',
  'bank_transfer',
  'mobile_pay',
  'other',
]);

export const paymentAllocationSchema = z
  .object({
    deliveryNoteId: recordIdSchema,
    amount: decimalStringSchema,
  })
  .strict();

export const receivePaymentSchema = z
  .object({
    customerId: recordIdSchema,
    amount: decimalStringSchema,
    paymentMethod: paymentMethodSchema,
    reference: z.string().trim().max(120, 'TooLong').optional().or(z.literal('')),
    notes: z.string().trim().max(500, 'TooLong').optional().or(z.literal('')),
    allocations: z.array(paymentAllocationSchema),
  })
  .strict();

export type ReceivePaymentInput = z.infer<typeof receivePaymentSchema>;

export const voidPaymentSchema = z
  .object({
    reason: z.string().trim().min(3, 'TooShort').max(200, 'TooLong'),
  })
  .strict();

export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;
