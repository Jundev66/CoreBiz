import type { VisionActorContext } from './types';
import type { VisionExtraction } from './documents';
import type { ProductMatch } from './ports';

export interface VisionDocumentCacheRecord {
  readonly documentHash: string;
  readonly extraction: VisionExtraction;
  readonly matches: readonly (readonly ProductMatch[])[];
  readonly cachedAt: string;
}

/**
 * Puerto de caché y deduplicación para Synapse Vision.
 *
 * Permite evitar el reprocesamiento de documentos idénticos (0 tokens de visión / LLM)
 * y consultar el histórico de ingesta antes de invocar a los modelos.
 */
export interface VisionDocumentCachePort {
  get(actor: VisionActorContext, documentHash: string): Promise<VisionDocumentCacheRecord | null>;
  set(actor: VisionActorContext, record: VisionDocumentCacheRecord): Promise<void>;
}

/**
 * Calcula la huella digital determinista de un documento codificado en base64.
 *
 * Genera un identificador hexadecimal determinista de 64 caracteres mediante
 * dispersión matemática pura (Math.imul), sin dependencias externas ni de runtime
 * específico (Node/Browser/Edge).
 */
export function computeDocumentHash(data: string): Promise<string> {
  let h1 = 0x811c9dc5;
  let h2 = 0x6c62272e;
  let h3 = 0x510e527f;
  let h4 = 0x9b05688c;

  for (let i = 0; i < data.length; i += 1) {
    const code = data.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ (code >>> 4), 0x5bd1e995);
    h3 = Math.imul(h3 ^ (code << 3), 0x27d4eb2f);
    h4 = Math.imul(h4 ^ (code + i), 0x165667b1);
  }

  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const p3 = (h3 >>> 0).toString(16).padStart(8, '0');
  const p4 = (h4 >>> 0).toString(16).padStart(8, '0');
  const p5 = (Math.imul(h1 ^ h3, 0x01000193) >>> 0).toString(16).padStart(8, '0');
  const p6 = (Math.imul(h2 ^ h4, 0x5bd1e995) >>> 0).toString(16).padStart(8, '0');
  const p7 = (Math.imul(h1 ^ h4, 0x27d4eb2f) >>> 0).toString(16).padStart(8, '0');
  const p8 = (Math.imul(h2 ^ h3, 0x165667b1) >>> 0).toString(16).padStart(8, '0');

  return Promise.resolve(`${p1}${p2}${p3}${p4}${p5}${p6}${p7}${p8}`);
}
