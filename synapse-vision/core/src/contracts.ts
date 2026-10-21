import { z } from 'zod';
import { visionExtractionSchema } from './documents';
import { MAX_CONTRACT_ITEMS, MAX_DOCUMENT_BASE64, MAX_IMAGE_BASE64 } from './security';

/**
 * El contrato de transporte entre la vista y cualquier host.
 *
 * Es la costura real del desacople: la vista (`@synapse-vision/ui`) y el backend
 * hablan este JSON, sin conocerse. Un host escrito en otro lenguaje sólo tiene que
 * exponer un endpoint compatible con estas formas.
 *
 * Todos los campos llevan tope: la respuesta de un host es entrada no confiable para la
 * vista, y un payload sin límites es un vector de agotamiento de memoria.
 */

export const visionExtractRequestSchema = z
  .object({
    imageBase64: z.string().min(1).max(MAX_IMAGE_BASE64),
    mimeType: z.string().trim().min(3).max(120),
    filename: z.string().trim().max(240).optional(),
  })
  .strict();

export type VisionExtractRequest = z.infer<typeof visionExtractRequestSchema>;

export const productMatchSchema = z
  .object({
    productId: z.string().max(64),
    sku: z.string().max(64),
    name: z.string().max(200),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const visionDocumentSchema = z
  .object({
    filename: z.string().max(240),
    mimeType: z.string().max(120),
    base64: z.string().max(MAX_DOCUMENT_BASE64),
  })
  .strict();

export const visionExtractResponseSchema = z
  .object({
    mode: z.enum(['model', 'demo']),
    extraction: visionExtractionSchema,
    matches: z.array(z.array(productMatchSchema).max(10)).max(MAX_CONTRACT_ITEMS),
    document: visionDocumentSchema.optional(),
  })
  .strict();

export type VisionExtractResponse = z.infer<typeof visionExtractResponseSchema>;
