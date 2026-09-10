import { z } from 'zod';
import { decimalStringSchema, recordIdSchema } from './common';

/**
 * Esquemas de entrada de ventas.
 *
 * La nota de entrega es el documento con mas invariantes del sistema, y casi todas se
 * comprueban en el dominio: que haya stock, que el cliente no exceda su credito, que
 * la tasa quede congelada. Aqui solo se valida la FORMA — que llegue un cliente, que
 * haya al menos una linea y que las cantidades parezcan cantidades.
 */

export const deliveryNoteLineSchema = z
  .object({
    productId: recordIdSchema,
    quantity: decimalStringSchema,
    /** Ausente, se toma el precio de catalogo del producto. */
    unitPrice: decimalStringSchema.optional(),
    /** Descuento en puntos basicos: 1250 es un 12,5 %. Entero, para no perder nada. */
    discountBp: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const issueDeliveryNoteSchema = z
  .object({
    customerId: recordIdSchema,
    /*
     * SIN `.min(1)`, y es deliberado.
     *
     * Que una nota necesite al menos una linea es una regla de NEGOCIO, y el dominio ya
     * la aplica devolviendo `NoLines`. Comprobarla tambien aqui parecia defensa en
     * profundidad y era otra cosa: el esquema respondia 400 con la clave dentro de
     * `fieldErrors` en lugar de 422 con `errorKind: 'NoLines'`, y la pantalla dejaba de
     * encontrar el mensaje que llevaba enseñando desde siempre. Lo detecto un escenario
     * BDD que no habia que tocar — que es exactamente para lo que estan.
     */
    lines: z.array(deliveryNoteLineSchema),
    notes: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .strict();

export type IssueDeliveryNoteInput = z.infer<typeof issueDeliveryNoteSchema>;

/**
 * Anular una nota emitida.
 *
 * El motivo es obligatorio y no se puede borrar despues. Una nota anulada sigue
 * existiendo —se numera de forma continua y devuelve el stock— asi que la unica
 * explicacion de por que dejo de valer es este texto.
 */
export const voidDeliveryNoteSchema = z
  .object({ reason: z.string().trim().min(3, 'TooShort').max(200, 'TooLong') })
  .strict();

export type VoidDeliveryNoteInput = z.infer<typeof voidDeliveryNoteSchema>;

/**
 * Confirmar la entrega de una nota ya emitida.
 *
 * `receivedBy` es OPCIONAL y es el punto del formulario: la nota impresa lleva una linea
 * de firma que dice "Recibido por", y hasta ahora el sistema no guardaba ese dato en
 * ninguna parte. Quien confirma la entrega suele tener delante el papel firmado, asi que
 * es el momento natural de teclear quien lo recibio.
 *
 * Opcional porque no siempre se sabe: una entrega en mostrador puede no tener firmante, y
 * exigir un nombre inventado seria peor que dejarlo vacio.
 */
export const markDeliveredSchema = z
  .object({
    receivedBy: z.string().trim().max(120, 'TooLong').optional().or(z.literal('')),
  })
  .strict();

export type MarkDeliveredInput = z.infer<typeof markDeliveredSchema>;
