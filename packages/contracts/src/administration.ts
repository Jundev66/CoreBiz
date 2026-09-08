import { z } from 'zod';

/**
 * Esquemas de entrada de administracion.
 *
 * El rol se valida contra la lista del DOMINIO y no contra una copia escrita aqui.
 * Se declara como cadena y el caso de uso lo resuelve: si esta lista viviera en dos
 * sitios, anadir un rol en `packages/domain` y olvidarlo aqui dejaria el rol nuevo
 * imposible de asignar, con un error de validacion que no menciona el motivo.
 */

export const inviteUserSchema = z
  .object({
    email: z
      .string()
      .trim()
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'InvalidFormat'),
    role: z.string().trim().min(1, 'Required'),
  })
  .strict();

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const changeMemberRoleSchema = z
  .object({ role: z.string().trim().min(1, 'Required') })
  .strict();

/**
 * Ajustes de la empresa.
 *
 * Todos los campos son opcionales porque es un PATCH: la pantalla envia solo lo que
 * ha cambiado. Con campos obligatorios, guardar el nombre obligaria a reenviar la tasa
 * de cambio, y una pantalla abierta desde hace un rato la reenviaria vieja.
 */
export const updateTenantSettingsSchema = z
  .object({
    name: z.string().trim().min(2, 'TooShort').max(120, 'TooLong').optional(),
    taxLabel: z.string().trim().min(2, 'TooShort').max(60, 'TooLong').optional(),
    /** Puntos basicos: 1600 = 16,00 %. Entero, para no arrastrar coma flotante. */
    taxRateBp: z.number().int().min(0).max(10_000).optional(),
    baseCurrency: z.string().trim().max(8).optional(),
    /** Decimal en texto: "36.50". Lo valida el value object del dominio. */
    exchangeRate: z.string().trim().max(32).optional(),
  })
  .strict();

export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;
