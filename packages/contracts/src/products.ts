import { z } from 'zod';
import { decimalStringSchema } from './common';

/**
 * Esquemas de entrada del catalogo.
 *
 * Los importes viajan como CADENA, no como number. Un precio en coma flotante pierde
 * centimos al sumar, y este sistema guarda dinero en enteros escalados justamente para
 * que eso no pase (ADR 002). Aceptar `number` aqui reintroduciria el problema en el
 * borde, que es donde menos se ve.
 */

export const createProductSchema = z
  .object({
    /** Vacio o ausente, lo genera el sistema. */
    sku: z.string().trim().max(32).optional().or(z.literal('')),
    name: z.string().trim().min(2, 'TooShort').max(120, 'TooLong'),
    price: decimalStringSchema,
    unit: z.string().trim().max(12).optional().or(z.literal('')),
    cost: decimalStringSchema.optional().or(z.literal('')),
    initialStock: decimalStringSchema.optional().or(z.literal('')),
    minStock: decimalStringSchema.optional().or(z.literal('')),
    taxable: z.boolean().optional(),
    trackStock: z.boolean().optional(),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Ajuste de inventario.
 *
 * Se pide el SALDO NUEVO y no la diferencia, y es deliberado: quien cuenta el almacen
 * tiene delante cuantas unidades hay, no cuantas sobran o faltan. Pedirle la resta es
 * pedirle que haga una cuenta que el sistema puede hacer sola, y equivocarse en ella.
 *
 * El motivo es OBLIGATORIO. Un ajuste sin explicacion es un descuadre sin rastro, y
 * este es el unico sitio donde el inventario cambia sin un documento detras.
 */
export const adjustStockSchema = z
  .object({
    newBalance: decimalStringSchema,
    reason: z.string().trim().min(3, 'TooShort').max(200, 'TooLong'),
  })
  .strict();

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
