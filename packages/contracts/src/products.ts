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
 * Corregir un producto.
 *
 * Tres campos del alta NO estan, y la ausencia es la regla:
 *
 *  - `sku`, porque el codigo de un producto suele existir antes que el sistema —esta
 *    impreso en la etiqueta del estante o es el codigo de barras del fabricante— y
 *    cambiarlo dejaria el estante diciendo una cosa y la pantalla otra.
 *  - `initialStock` y `trackStock`, porque el saldo solo se mueve declarando un
 *    movimiento. Para corregirlo esta `adjustStock`, que EXIGE un motivo; y apagar el
 *    seguimiento de un producto con existencias deja ese saldo huerfano, que es una
 *    migracion de datos y no una casilla de un formulario.
 *
 * Con `.strict()`, mandarlos igualmente da un 400 en lugar de ignorarse en silencio.
 *
 * Gana `description`, que el dominio guardaba desde el principio y ningun formulario
 * pedia.
 */
export const updateProductSchema = createProductSchema
  .omit({ sku: true, initialStock: true, trackStock: true })
  .extend({
    productId: z.string().min(1),
    description: z.string().trim().max(500, 'TooLong').optional().or(z.literal('')),
  })
  .strict();

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** El mismo comando por HTTP. Sin `productId`: ahi viaja en la ruta. */
export const updateProductBodySchema = updateProductSchema.omit({ productId: true }).strict();

const UPDATE_PRODUCT_FIELDS = [
  'productId',
  'name',
  'price',
  'unit',
  'cost',
  'minStock',
  'description',
] as const;

/**
 * Convierte el formulario de edicion al schema.
 *
 * Lista explicita, nunca `Object.fromEntries`: es la defensa contra mass assignment y
 * ademas React inyecta sus propios campos en el FormData de una Server Action, con lo
 * que `.strict()` fallaria en todos los envios.
 *
 * `taxable` va aparte porque es una casilla: un checkbox sin marcar NO se envia, asi
 * que su ausencia significa `false` y no "no me lo has dado". Leerlo con el resto lo
 * dejaria como `undefined` y la casilla no se podria desmarcar nunca — el mismo fallo
 * que tenia la direccion de un cliente antes de arreglarlo.
 */
export function parseProductUpdateForm(formData: FormData) {
  const raw: Record<string, string | boolean> = {};
  for (const field of UPDATE_PRODUCT_FIELDS) {
    const value = formData.get(field);
    if (typeof value === 'string') raw[field] = value;
  }
  raw.taxable = formData.get('taxable') !== null;
  return updateProductSchema.safeParse(raw);
}

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
