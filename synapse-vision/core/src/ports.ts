import type { VisionActorContext, VisionConnection, VisionResult } from './types';

/**
 * Puertos que el host (CoreBiz, otro ERP, un backend en otro lenguaje) implementa.
 *
 * Todo lo específico del negocio vive aquí: resolver un producto por su descripción,
 * emparejar un proveedor, decidir permisos. El paquete nunca toca una base de datos.
 */

/** Un producto candidato del catálogo del host para una descripción leída. */
export interface ProductMatch {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  /** 0..1. El host decide cómo puntúa; el paquete sólo lo transporta. */
  readonly confidence: number;
}

export interface VisionBridgePort {
  readonly erpName: string;
  /** Moneda base del host, para cuando el documento no la declara. */
  readonly currency: string;
  /** Si este actor puede dar de alta la recepción resultante. */
  canIngest(actor: VisionActorContext): boolean;
  /** Candidatos del catálogo para una descripción leída del documento. */
  matchProduct(actor: VisionActorContext, description: string): Promise<readonly ProductMatch[]>;
  /** Id del proveedor del host que corresponde a un nombre leído, o `null`. */
  resolveSupplier(actor: VisionActorContext, name: string): Promise<string | null>;
}

/**
 * Adaptador al modelo de visión. El host lo implementa hablando con su proveedor
 * (Ollama local, un servicio propio, Anthropic…). Se mantiene fuera del paquete para
 * que éste siga siendo `zod` + TypeScript puro.
 */
export interface VisionModelPort {
  extract(input: {
    readonly connection: VisionConnection;
    readonly imageBase64: string;
    readonly mimeType: string;
    readonly prompt: string;
  }): Promise<VisionResult<unknown>>;
}

/**
 * Adaptador de embeddings. El host lo implementa hablando con su proveedor
 * (biz/Ollama, OpenAI, etc.). Mantiene el paquete puro (zod + TS).
 */
export interface VisionEmbeddingsPort {
  readonly model: string;
  readonly dimensions: number;
  embed(input: { readonly texts: readonly string[] }): Promise<ReadonlyArray<readonly number[]>>;
}

/**
 * Registro de vector para indexado (sin exportación fuera si no necesario, pero útil para tipos).
 */
export interface VisionVectorRecord {
  readonly entityType: 'product' | 'supplier';
  readonly entityId: string;
  readonly label: string;
  readonly embedding: readonly number[];
}

/**
 * Coincidencia semántica devuelta por el vector store.
 */
export interface VisionVectorMatch {
  readonly entityType: 'product' | 'supplier';
  readonly entityId: string;
  readonly label: string;
  readonly score: number; // 0..1
}

/**
 * Adaptador de almacenamiento vectorial. El host lo implementa (pgvector) manteniendo el
 * aislamiento por tenant (actor). El paquete nunca toca la BD directamente.
 */
export interface VisionVectorStorePort {
  upsert(actor: VisionActorContext, records: readonly VisionVectorRecord[]): Promise<void>;
  search(
    actor: VisionActorContext,
    input: {
      readonly entityType: 'product' | 'supplier';
      readonly embedding: readonly number[];
      readonly limit: number;
      readonly minScore?: number;
    },
  ): Promise<readonly VisionVectorMatch[]>;
}
