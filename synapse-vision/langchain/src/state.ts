import { Annotation } from '@langchain/langgraph';
import type {
  ProductMatch,
  VisionActorContext,
  VisionConnection,
  VisionDocument,
  VisionError,
  VisionExtraction,
  VisionImageInput,
  VisionMode,
} from '@synapse-vision/core';

export type VisionGraphStatus =
  'pending' | 'cached' | 'extracted' | 'validated' | 'enriched' | 'demo' | 'failed';

/**
 * Estado tipado del Grafo de LangGraph para Synapse Vision.
 *
 * Cada canal del grafo está estrictamente tipado y mantiene la trazabilidad
 * del documento, las decisiones de deduplicación y el ahorro de tokens.
 */
export const VisionGraphAnnotation = Annotation.Root({
  actor: Annotation<VisionActorContext>(),
  connection: Annotation<VisionConnection | null>(),
  image: Annotation<VisionImageInput>(),

  documentHash: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  isCached: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  mode: Annotation<VisionMode>({
    reducer: (_, next) => next,
    default: () => 'model',
  }),

  rawExtraction: Annotation<unknown>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  extraction: Annotation<VisionExtraction | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  matches: Annotation<readonly (readonly ProductMatch[])[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  document: Annotation<VisionDocument | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  error: Annotation<VisionError | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  status: Annotation<VisionGraphStatus>({
    reducer: (_, next) => next,
    default: () => 'pending',
  }),
});

export type VisionGraphState = typeof VisionGraphAnnotation.State;
