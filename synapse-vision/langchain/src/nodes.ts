import {
  buildExtractionPrompt,
  computeDocumentHash,
  demoDocument,
  demoExtraction,
  parseVisionExtraction,
  redactExtraction,
  validateImageInput,
  type VisionBridgePort,
  type VisionDocumentCachePort,
  type VisionModelPort,
} from '@synapse-vision/core';
import type { VisionGraphState } from './state';

export interface VisionNodesDeps {
  readonly bridge: VisionBridgePort;
  readonly model?: VisionModelPort | undefined;
  readonly cache?: VisionDocumentCachePort | undefined;
}

export function createVisionNodes(deps: VisionNodesDeps) {
  return {
    async deduplication(state: VisionGraphState): Promise<Partial<VisionGraphState>> {
      const invalid = validateImageInput(state.image);
      if (invalid !== null) {
        return {
          error: { kind: 'InvalidFormat', message: invalid },
          status: 'failed',
        };
      }

      const documentHash = await computeDocumentHash(state.image.imageBase64);

      if (deps.cache !== undefined) {
        const cached = await deps.cache.get(state.actor, documentHash);
        if (cached !== null) {
          return {
            documentHash,
            isCached: true,
            mode: 'model',
            extraction: cached.extraction,
            matches: cached.matches,
            status: 'cached',
          };
        }
      }

      return {
        documentHash,
        isCached: false,
        status: 'pending',
      };
    },

    async visionExtraction(state: VisionGraphState): Promise<Partial<VisionGraphState>> {
      if (state.isCached || state.error !== null) return {};

      const isAvailable =
        deps.model !== undefined &&
        state.connection !== null &&
        typeof state.connection.model === 'string' &&
        state.connection.model.trim() !== '';

      if (!isAvailable || state.connection === null || deps.model === undefined) {
        // Fallback en modo demo (garantía de doble modo sin IA)
        const extraction = redactExtraction(demoExtraction());
        return {
          mode: 'demo',
          extraction,
          document: demoDocument(),
          status: 'demo',
        };
      }

      const prompt = buildExtractionPrompt(deps.bridge, state.actor);
      const raw = await deps.model.extract({
        connection: state.connection,
        imageBase64: state.image.imageBase64,
        mimeType: state.image.mimeType,
        prompt,
      });

      if (!raw.ok) {
        return {
          error: raw.error,
          status: 'failed',
        };
      }

      return {
        rawExtraction: raw.value,
        mode: 'model',
        status: 'extracted',
      };
    },

    schemaValidation(state: VisionGraphState): Partial<VisionGraphState> {
      if (state.isCached || state.status === 'demo' || state.error !== null) return {};

      const extraction = parseVisionExtraction(state.rawExtraction);
      if (extraction === null) {
        return {
          error: {
            kind: 'InvalidFormat',
            message: 'El modelo no devolvió una estructura válida.',
          },
          status: 'failed',
        };
      }

      const safeExtraction = redactExtraction(extraction);
      return {
        extraction: safeExtraction,
        status: 'validated',
      };
    },

    async ragEnrichment(state: VisionGraphState): Promise<Partial<VisionGraphState>> {
      if (state.isCached || state.error !== null || state.extraction === null) return {};

      const matches = await Promise.all(
        state.extraction.lines.map((line) =>
          deps.bridge.matchProduct(state.actor, line.description),
        ),
      );

      return {
        matches,
        status: 'enriched',
      };
    },

    async cachePersist(state: VisionGraphState): Promise<Partial<VisionGraphState>> {
      if (
        state.isCached ||
        state.status === 'demo' ||
        state.error !== null ||
        state.extraction === null ||
        deps.cache === undefined ||
        state.documentHash === ''
      ) {
        return {};
      }

      await deps.cache.set(state.actor, {
        documentHash: state.documentHash,
        extraction: state.extraction,
        matches: state.matches,
        cachedAt: new Date().toISOString(),
      });

      return {};
    },
  };
}
