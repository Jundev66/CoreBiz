import { z } from 'zod';

/**
 * Todos los schemas usan `.strict()`: una propiedad no declarada es un ERROR, no algo
 * que se ignora en silencio. Es la defensa contra mass assignment — sin esto, un POST
 * con `{ tenantId: "otro" }` colado en el cuerpo podria llegar mas lejos de lo debido.
 */
export const uuidSchema = z.string().uuid();

/**
 * Un identificador de registro, tal como llega por HTTP.
 *
 * NO es `uuidSchema`, y la diferencia importa: sobre Postgres los identificadores son
 * uuidv7, pero el adaptador EN MEMORIA usa cadenas legibles a proposito —
 * `00000000-0000-0000-0000-0000000c001`— porque ahi no hay una columna `uuid` que
 * satisfacer y unos identificadores que se pueden leer hacen depurables los datos
 * sembrados.
 *
 * Exigir uuid aqui rompia `pnpm dev:nodb` y la suite BDD entera con un error de
 * validacion en el borde, sin que el dominio llegase a enterarse. Y no aportaba
 * seguridad: quien no tiene acceso a un registro recibe 404 lo escriba como lo
 * escriba, porque el filtro es la pertenencia al tenant, no la forma del texto.
 */
export const recordIdSchema = z.string().trim().min(1, 'Required').max(64, 'TooLong');

/** Importe tal y como lo escribe un usuario: acepta coma o punto decimal. */
export const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+([.,]\d+)?$/, 'Importe invalido');

export const currencySchema = z.enum(['USD', 'VES']);

export const paginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().optional(),
  })
  .strict();

export type Pagination = z.infer<typeof paginationSchema>;

/**
 * Archivar un registro, o devolverlo a la lista.
 *
 * Uno solo para clientes, productos y proveedores: los tres se archivan por la misma
 * razon —aparecen en documentos ya emitidos y borrarlos dejaria esos documentos
 * apuntando al vacio— y con la misma forma.
 */
export const setStatusSchema = z.object({ archived: z.boolean() }).strict();
