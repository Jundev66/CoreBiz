import { z } from 'zod';
import { decimalStringSchema } from './common';

/**
 * Esquemas de entrada del modulo de clientes.
 *
 * Un unico schema por comando, compartido por el formulario del navegador y la Server
 * Action del servidor. Asi la validacion de cliente y la de servidor no pueden
 * divergir, que es de donde sale la mitad de los agujeros de validacion en un CRUD.
 *
 * `.strict()` en todos: una propiedad no declarada es un ERROR, no algo que se ignora
 * en silencio. Es la defensa contra mass assignment — sin esto, un `tenantId` colado
 * en el cuerpo de la peticion podria llegar mas lejos de lo debido.
 */

export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(2, 'TooShort').max(120, 'TooLong'),
    taxId: z.string().trim().max(24).optional().or(z.literal('')),
    // El email se valida por forma minima, igual que en el dominio: las regex
    // "estrictas" rechazan direcciones perfectamente validas.
    email: z
      .string()
      .trim()
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'InvalidFormat')
      .optional()
      .or(z.literal('')),
    phone: z.string().trim().max(32).optional().or(z.literal('')),
    creditLimit: decimalStringSchema.optional().or(z.literal('')),
  })
  .strict();

export type CreateCustomerFormInput = z.infer<typeof createCustomerSchema>;

/** Campos que este comando acepta. Cualquier otro se ignora por completo. */
const CREATE_CUSTOMER_FIELDS = ['name', 'taxId', 'email', 'phone', 'creditLimit'] as const;

/**
 * Convierte un formulario HTML al schema.
 *
 * Se extraen SOLO los campos declarados en lugar de volcar el FormData entero con
 * `Object.fromEntries`. Dos razones, y la segunda se descubrio con un test:
 *
 *  1. Es la defensa efectiva contra mass assignment: lo que no esta en la lista no
 *     llega al dominio, punto. No depende de que `.strict()` lo rechace despues.
 *  2. React inyecta sus propios campos en el FormData de una Server Action
 *     (identificadores internos de la accion). Volcarlo entero hacia que `.strict()`
 *     fallase SIEMPRE, y el formulario nunca llegaba a guardar nada.
 */
export function parseCustomerForm(formData: FormData) {
  const raw: Record<string, string> = {};
  for (const field of CREATE_CUSTOMER_FIELDS) {
    const value = formData.get(field);
    if (typeof value === 'string') raw[field] = value;
  }
  return createCustomerSchema.safeParse(raw);
}
