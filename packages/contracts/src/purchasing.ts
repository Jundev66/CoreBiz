import { z } from 'zod';
import { decimalStringSchema, recordIdSchema } from './common';

/**
 * Esquemas de entrada de compras.
 *
 * El modulo entero esta reservado al plan PRO, y ese limite NO se comprueba aqui: vive
 * en el caso de uso, que es lo unico que lo aplica venga la peticion de donde venga.
 * Un esquema que rechazase por plan daria un 400 donde corresponde un 403, y ademas
 * pondria una regla de negocio en el sitio donde nadie la busca.
 */

export const createSupplierSchema = z
  .object({
    name: z.string().trim().min(2, 'TooShort').max(120, 'TooLong'),
    taxId: z.string().trim().max(24).optional().or(z.literal('')),
    email: z
      .string()
      .trim()
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'InvalidFormat')
      .optional()
      .or(z.literal('')),
    phone: z.string().trim().max(32).optional().or(z.literal('')),
    contactName: z.string().trim().max(120).optional().or(z.literal('')),
    notes: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .strict();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const goodsReceiptLineSchema = z
  .object({
    productId: recordIdSchema,
    quantity: decimalStringSchema,
    /**
     * El coste es OBLIGATORIO al recibir, a diferencia del precio al vender.
     * Recibir mercancia sin coste deja el inventario valorado a cero y el margen
     * mintiendo desde ese momento en adelante.
     */
    unitCost: decimalStringSchema,
  })
  .strict();

export const receiveGoodsSchema = z
  .object({
    supplierId: recordIdSchema,
    lines: z.array(goodsReceiptLineSchema).min(1, 'NoLines'),
    /** El numero de factura o guia del proveedor, para poder cuadrar despues. */
    supplierReference: z.string().trim().max(64).optional().or(z.literal('')),
    notes: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .strict();

export type ReceiveGoodsInput = z.infer<typeof receiveGoodsSchema>;
