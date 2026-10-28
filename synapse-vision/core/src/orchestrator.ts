import type { VisionActorContext, VisionConnection, VisionDocument, VisionMode } from './types';
import { visionErr, visionOk, type VisionResult } from './types';
import type { ProductMatch, VisionBridgePort, VisionModelPort } from './ports';
import type { VisionExtraction } from './documents';
import { parseVisionExtraction } from './documents';
import { buildExtractionPrompt } from './prompt';
import { demoDocument, demoExtractionFor, isDemoFilename } from './demo';
import { redactExtraction, validateImageInput } from './security';
import { computeDocumentHash, type VisionDocumentCachePort } from './deduplication';

export interface VisionOrchestratorDeps {
  readonly bridge: VisionBridgePort;
  /** Sin este puerto, el orquestador funciona siempre en modo demo. */
  readonly model?: VisionModelPort;
  /** Deduplicación y caché de documentos para ahorro de tokens. */
  readonly cache?: VisionDocumentCachePort;
}

export interface VisionImageInput {
  readonly imageBase64: string;
  readonly mimeType: string;
  readonly filename?: string;
}

export interface VisionExtractSuccess {
  readonly mode: VisionMode;
  readonly cached?: boolean;
  readonly documentHash?: string;
  readonly extraction: VisionExtraction;
  /** Productos del catálogo del host candidatos para cada línea, en el mismo orden. */
  readonly matches: readonly (readonly ProductMatch[])[];
  /** Presente en modo demo: el documento de ejemplo, descargable o servible. */
  readonly document?: VisionDocument;
}

export type VisionExtractResult = VisionResult<VisionExtractSuccess>;

/**
 * El cerebro de Synapse Vision. Doble modo, siempre disponible:
 *
 *   - `'model'`: hay conexión al modelo y un `VisionModelPort` — se pide la extracción y se
 *     valida contra el esquema.
 *   - `'demo'`: no hay IA configurada — se devuelve el documento y la extracción de ejemplo.
 *
 * Nunca lanza y nunca devuelve "no hay IA" como error: en producción sin proveedor, la
 * capacidad se muestra con datos de ejemplo en lugar de romperse.
 */
export class VisionOrchestrator {
  constructor(private readonly deps: VisionOrchestratorDeps) {}

  isModelAvailable(connection: VisionConnection | null): boolean {
    return (
      connection !== null &&
      this.deps.model !== undefined &&
      typeof connection.model === 'string' &&
      connection.model.trim() !== ''
    );
  }

  /** El resultado de ejemplo. Es también el fallback cuando no hay IA. */
  async demo(actor?: VisionActorContext, filename?: string): Promise<VisionExtractSuccess> {
    const extraction = demoExtractionFor(filename);
    const safeExtraction = redactExtraction(extraction);
    const matches =
      actor !== undefined
        ? await Promise.all(
            safeExtraction.lines.map((line) =>
              this.deps.bridge.matchProduct(actor, line.description),
            ),
          )
        : [];

    return {
      mode: 'demo',
      extraction: safeExtraction,
      matches,
      document: demoDocument(filename),
    };
  }

  async extract(
    actor: VisionActorContext,
    connection: VisionConnection | null,
    image: VisionImageInput,
  ): Promise<VisionExtractResult> {
    const model = this.deps.model;
    const isSample = isDemoFilename(image.filename);
    if (model === undefined || !this.isModelAvailable(connection) || connection === null) {
      if (isSample) {
        return visionOk(await this.demo(actor, image.filename));
      }
      return visionErr({
        kind: 'AiNotConfigured',
        message:
          'Para procesar tus propios comprobantes necesitas conectar un proveedor de IA en Ajustes.',
      });
    }

    const invalid = validateImageInput(image);
    if (invalid !== null) return visionErr({ kind: 'InvalidFormat', message: invalid });

    const documentHash = await computeDocumentHash(image.imageBase64);
    if (this.deps.cache !== undefined) {
      const cached = await this.deps.cache.get(actor, documentHash);
      if (cached !== null) {
        return visionOk({
          mode: 'model',
          cached: true,
          documentHash,
          extraction: cached.extraction,
          matches: cached.matches,
        });
      }
    }

    const prompt = buildExtractionPrompt(this.deps.bridge, actor);
    const raw = await model.extract({
      connection,
      imageBase64: image.imageBase64,
      mimeType: image.mimeType,
      prompt,
    });
    if (!raw.ok) return raw;

    const extraction = parseVisionExtraction(raw.value);
    if (extraction === null) {
      return visionErr({
        kind: 'InvalidFormat',
        message: 'El modelo no devolvió una estructura válida.',
      });
    }

    // El texto libre puede traer por accidente datos sensibles: se redacta antes de
    // resolver productos y de que la extracción salga del paquete.
    const safeExtraction = redactExtraction(extraction);

    const matches = await Promise.all(
      safeExtraction.lines.map((line) => this.deps.bridge.matchProduct(actor, line.description)),
    );

    if (this.deps.cache !== undefined) {
      await this.deps.cache.set(actor, {
        documentHash,
        extraction: safeExtraction,
        matches,
        cachedAt: new Date().toISOString(),
      });
    }

    return visionOk({
      mode: 'model',
      cached: false,
      documentHash,
      extraction: safeExtraction,
      matches,
    });
  }
}
