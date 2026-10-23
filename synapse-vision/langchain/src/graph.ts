import { END, START, StateGraph } from '@langchain/langgraph';
import { VisionGraphAnnotation, type VisionGraphState } from './state';
import { createVisionNodes, type VisionNodesDeps } from './nodes';
import {
  visionErr,
  visionOk,
  type VisionActorContext,
  type VisionConnection,
  type VisionExtractResult,
  type VisionExtractSuccess,
  type VisionImageInput,
} from '@synapse-vision/core';

export type VisionGraphDeps = VisionNodesDeps;

export function buildVisionGraph(deps: VisionGraphDeps) {
  const nodes = createVisionNodes(deps);

  const workflow = new StateGraph(VisionGraphAnnotation)
    .addNode('deduplication', (state) => nodes.deduplication(state))
    .addNode('vision_extraction', (state) => nodes.visionExtraction(state))
    .addNode('schema_validation', (state) => nodes.schemaValidation(state))
    .addNode('rag_enrichment', (state) => nodes.ragEnrichment(state))
    .addNode('cache_persist', (state) => nodes.cachePersist(state))
    .addEdge(START, 'deduplication')
    .addConditionalEdges('deduplication', (state: VisionGraphState) => {
      return state.isCached || state.error !== null ? END : 'vision_extraction';
    })
    .addConditionalEdges('vision_extraction', (state: VisionGraphState) => {
      if (state.error !== null) return END;
      if (state.status === 'demo') return 'rag_enrichment';
      return 'schema_validation';
    })
    .addConditionalEdges('schema_validation', (state: VisionGraphState) => {
      if (state.error !== null) return END;
      return 'rag_enrichment';
    })
    .addEdge('rag_enrichment', 'cache_persist')
    .addEdge('cache_persist', END);

  return workflow.compile();
}

/**
 * Orquestador de Synapse Vision impulsado por LangGraph.
 *
 * Implementa el mismo contrato agnóstico que `VisionOrchestrator`,
 * permitiendo ejecutar el flujo como un grafo de estados determinista
 * con máxima optimización de tokens.
 */
export class LangGraphVisionOrchestrator {
  private readonly app: ReturnType<typeof buildVisionGraph>;

  constructor(deps: VisionGraphDeps) {
    this.app = buildVisionGraph(deps);
  }

  async extract(
    actor: VisionActorContext,
    connection: VisionConnection | null,
    image: VisionImageInput,
  ): Promise<VisionExtractResult> {
    const initialState = {
      actor,
      connection,
      image,
    };

    const finalState = await this.app.invoke(initialState);

    if (finalState.error !== null) {
      return visionErr(finalState.error);
    }

    if (finalState.extraction === null) {
      return visionErr({
        kind: 'InvalidFormat',
        message: 'No se obtuvo ninguna extracción válida del grafo.',
      });
    }

    const success: VisionExtractSuccess = {
      mode: finalState.mode,
      cached: finalState.isCached,
      documentHash: finalState.documentHash,
      extraction: finalState.extraction,
      matches: finalState.matches,
      ...(finalState.document !== undefined ? { document: finalState.document } : {}),
    };

    return visionOk(success);
  }
}
