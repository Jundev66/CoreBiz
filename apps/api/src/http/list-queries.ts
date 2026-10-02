import { z } from 'zod';
import { paginationSchema } from '@corebiz/contracts';
import { RESOURCES } from '@corebiz/domain';

/**
 * Esquemas de los parametros de consulta de los listados.
 *
 * Viven aqui y no en `@corebiz/contracts` porque no se comparten con nadie: una
 * cadena de consulta es una idea de HTTP, y `contracts` existe para los esquemas que
 * usan A LA VEZ el formulario del navegador y el servidor. Meter aqui cosas que solo
 * usa un lado diluiria eso hasta que deje de significar nada.
 *
 * `.strict()` en todos, igual que en los comandos: un parametro que nadie ha declarado
 * es un error, no algo que se ignore. Sin eso, `?includeArchived=1` mal escrito
 * —`?includearchived=1`— pasaria en silencio y el listado ensenaria lo que no debe.
 */

/** `?includeArchived=true`. Todo llega como cadena en una URL. */
const booleanFlag = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const customerListQuerySchema = paginationSchema
  .extend({
    search: z.string().trim().max(120).optional(),
    includeArchived: booleanFlag,
  })
  .strict();

export const productListQuerySchema = paginationSchema
  .extend({
    search: z.string().trim().max(120).optional(),
    includeArchived: booleanFlag,
  })
  .strict();

export const deliveryNoteListQuerySchema = paginationSchema
  .extend({
    status: z.string().trim().max(32).optional(),
  })
  .strict();

export const receiptListQuerySchema = paginationSchema.strict();

export const auditQuerySchema = paginationSchema
  .extend({
    action: z.string().trim().max(64).optional(),
    actorEmail: z.string().trim().max(160).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

/** El export no pagina: se lleva todo lo que cabe en el tope. */
export const auditExportQuerySchema = z
  .object({
    action: z.string().trim().max(64).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

export const usageQuerySchema = z
  .object({
    /**
     * `?resources=customers,products`: una sola llamada para pintar varias cuotas.
     *
     * Bounded, because every listed resource becomes its own database query run in
     * parallel: with no bound, one request with thousands of names starved the shared
     * connection pool for every company. Only known resources, at most as many as exist,
     * and a short raw string so nothing large is even split.
     */
    resources: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .transform((raw) =>
        raw
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== ''),
      )
      .pipe(z.array(z.enum(RESOURCES)).min(1).max(RESOURCES.length)),
  })
  .strict();

export const supplierListQuerySchema = paginationSchema
  .extend({
    search: z.string().trim().max(120).optional(),
    includeArchived: booleanFlag,
  })
  .strict();

export const optionsQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();

/** The dashboard's short list: a handful of rows, never the catalogue. */
export const lowStockQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(10) })
  .strict();

/**
 * Quita las claves cuyo valor es `undefined`.
 *
 * Hace falta por `exactOptionalPropertyTypes`, que esta activo en todo el monorepo: un
 * puerto que declara `search?: string` NO acepta `{ search: undefined }`. Y zod, al
 * inferir un campo opcional, produce exactamente eso.
 *
 * La regla es incomoda aqui y es correcta en general: distingue "no lo se" de "vale
 * undefined", y esa distincion es la que impide que un filtro ausente y un filtro
 * vacio acaben significando lo mismo. La alternativa era escribir el spread
 * condicional en cada listado, seis veces, y olvidarlo una.
 */
export function withoutUndefined<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}
