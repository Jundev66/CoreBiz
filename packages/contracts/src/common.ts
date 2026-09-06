import { z } from 'zod';

/**
 * Todos los schemas usan `.strict()`: una propiedad no declarada es un ERROR, no algo
 * que se ignora en silencio. Es la defensa contra mass assignment — sin esto, un POST
 * con `{ tenantId: "otro" }` colado en el cuerpo podria llegar mas lejos de lo debido.
 */
export const uuidSchema = z.string().uuid();

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
