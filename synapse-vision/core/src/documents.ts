import { z } from 'zod';

/**
 * El contrato de datos que Synapse Vision produce a partir de un documento de recepción.
 *
 * Es deliberadamente NO fiscal: CoreBiz emite notas de entrega internas, no documentos
 * tributarios, y este esquema describe exactamente lo que un comercio necesita para dar de
 * alta una recepción de mercancía. Cualquier campo tributario está fuera por diseño
 * (ver `scripts/check-non-fiscal.sh`).
 *
 * La extracción del modelo es entrada NO confiable: siempre se valida contra este esquema
 * antes de salir del paquete.
 */

export const visionLineSchema = z
  .object({
    /** Texto tal como aparece en el documento, ya normalizado. */
    description: z.string().trim().min(1).max(200),
    quantity: z.number().positive(),
    /** Unidad de medida: caja, bolsa, pote… libre. */
    unit: z.string().trim().min(1).max(24),
    unitCost: z.number().nonnegative(),
  })
  .strict();

export type VisionLine = z.infer<typeof visionLineSchema>;

export const visionExtractionSchema = z
  .object({
    /** Razón social o nombre del proveedor que emite. */
    supplier: z.string().trim().min(1).max(200),
    /** Referencia del documento (número de remisión o nota). No es numeración de control. */
    reference: z.string().trim().min(1).max(80),
    /** Fecha de emisión, como texto ISO (`YYYY-MM-DD`). */
    issuedAt: z.string().trim().min(1).max(40),
    /** Moneda del documento (ISO-4217). */
    currency: z.string().trim().length(3),
    lines: z.array(visionLineSchema).min(1).max(200),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type VisionExtraction = z.infer<typeof visionExtractionSchema>;

/**
 * Interpreta un valor no confiable como una extracción válida.
 * Devuelve `null` cuando no cumple el contrato — nunca lanza.
 */
export function parseVisionExtraction(raw: unknown): VisionExtraction | null {
  const parsed = visionExtractionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
