import type { VisionExtraction } from './documents';

/**
 * Higiene de entrada para Synapse Vision.
 *
 * La imagen y su metadata llegan de un navegador y el texto extraído es salida de un
 * modelo: ambos son entrada NO confiable. Estas funciones acotan lo que el paquete
 * acepta y redactan lo que no debe viajar.
 */

/** Mime types de imagen que este paquete acepta como documento escaneado. */
export const ACCEPTED_IMAGE_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

export type AcceptedImageMime = (typeof ACCEPTED_IMAGE_MIME)[number];

export function isAcceptedImageMime(mime: string): mime is AcceptedImageMime {
  return (ACCEPTED_IMAGE_MIME as readonly string[]).includes(mime);
}

/** Tope de tamaño de la imagen codificada en base64 (~15 MB). */
export const MAX_IMAGE_BASE64 = 20_000_000;

/** Tope del documento de ejemplo servido por el host (~20 MB decodificados). */
export const MAX_DOCUMENT_BASE64 = 28_000_000;

/** Tope de elementos en una lista arbitraria del contrato (líneas, coincidencias). */
export const MAX_CONTRACT_ITEMS = 200;

const BASE64_CHUNK = /^[A-Za-z0-9+/=\r\n]+$/;
const CHUNK_SIZE = 32_768;

function isBase64String(value: string): boolean {
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    if (!BASE64_CHUNK.test(value.slice(i, i + CHUNK_SIZE))) {
      return false;
    }
  }
  return true;
}

/**
 * Valida la forma de una imagen entrante sin decodificarla.
 * Devuelve un motivo legible o `null` si es aceptable.
 */
export function validateImageInput(input: {
  readonly imageBase64: string;
  readonly mimeType: string;
}): string | null {
  if (!isAcceptedImageMime(input.mimeType)) return 'Formato de imagen no soportado.';
  if (input.imageBase64.length === 0) return 'La imagen está vacía.';
  if (input.imageBase64.length > MAX_IMAGE_BASE64) return 'La imagen supera el tamaño permitido.';
  if (!isBase64String(input.imageBase64)) return 'La imagen no está en base64.';
  return null;
}

const EMAIL = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
const TOKEN =
  /\b(?:eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|(?:sk|key|token)-[a-zA-Z0-9_-]{16,})\b/gi;

/**
 * Redacta datos sensibles de texto libre antes de registrarlo o reenviarlo.
 * No pretende ser exhaustiva: cubre lo que aparece por accidente en documentos.
 */
export function redactSensitiveData(text: string): string {
  if (text === '') return '';
  return text.replace(EMAIL, '[EMAIL_PROTEGIDO]').replace(TOKEN, '[TOKEN_PROTEGIDO]');
}

/**
 * Devuelve una copia de la extracción con el texto libre redactado.
 *
 * Se aplica SIEMPRE antes de sacar datos del paquete: un documento puede traer por
 * accidente un correo o un token en las observaciones o en una descripción, y eso no
 * debe viajar al host ni a ningún registro. Se redacta el texto libre, no los números.
 */
export function redactExtraction(extraction: VisionExtraction): VisionExtraction {
  return {
    ...extraction,
    supplier: redactSensitiveData(extraction.supplier),
    reference: redactSensitiveData(extraction.reference),
    lines: extraction.lines.map((line) => ({
      ...line,
      description: redactSensitiveData(line.description),
    })),
    ...(extraction.notes === undefined ? {} : { notes: redactSensitiveData(extraction.notes) }),
  };
}
