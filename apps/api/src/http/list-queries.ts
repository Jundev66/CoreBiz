import { z } from 'zod';
import { paginationSchema } from '@corebiz/contracts';

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

/**
 * Sin `cursor`, y no es un olvido: `ProductQueries.list` no lo acepta. Declararlo aqui
 * lo dejaria pasar la validacion para que el adaptador lo ignorase en silencio, y una
 * segunda pagina que siempre devuelve la primera es de los fallos mas dificiles de ver.
 */
export const productListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(120).optional(),
    includeArchived: booleanFlag,
  })
  .strict();

/** Tampoco lleva cursor, por lo mismo: `DeliveryNoteQueries.list` solo filtra y limita. */
export const deliveryNoteListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: z.string().trim().max(32).optional(),
  })
  .strict();

/** Ni las recepciones de mercancia. */
export const receiptListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(25) })
  .strict();

export const auditQuerySchema = paginationSchema
  .extend({
    action: z.string().trim().max(64).optional(),
    actorEmail: z.string().trim().max(160).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

export const usageQuerySchema = z
  .object({
    /** `?resources=customers,products`: una sola llamada para pintar varias cuotas. */
    resources: z
      .string()
      .trim()
      .min(1)
      .transform((raw) =>
        raw
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== ''),
      ),
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
