import type {
  VisionActorContext,
  VisionDocumentCachePort,
  VisionDocumentCacheRecord,
  VisionVectorMatch,
  VisionVectorRecord,
  VisionVectorStorePort,
} from '@synapse-vision/core';

/**
 * El almacen vectorial en memoria, espejo del de pgvector.
 *
 * Existe por la misma razon que el resto de dobles del paquete: que la busqueda semantica
 * sea DEMOSTRABLE y PROBABLE sin Docker. Sin el, el driver en memoria no monta indice, el
 * emparejamiento cae siempre a texto y la funcion solo existe sobre Postgres — justo lo que
 * la arquitectura hexagonal promete que no pasa.
 *
 * No es un indice real: recorre todas las filas del tenant y calcula la similitud coseno en
 * JavaScript. Para un catalogo de comercio pequeno es mas que suficiente, y para lo que
 * importa aqui —unos cientos de productos— el coste es despreciable.
 *
 * El aislamiento por tenant es el mismo contrato que el adaptador de Postgres: cada fila
 * lleva su `tenantId` y `search` NUNCA devuelve una de otro. No hay RLS que valga, asi que la
 * comprobacion es explicita y esta en un solo sitio.
 */

export interface MemoryVisionVectorStoreOptions {
  /** Modelo de embeddings; filtra la busqueda igual que la columna `model` de Postgres. */
  readonly model: string;
}

/** Una fila indexada: el vector mas lo que hace falta para devolver la coincidencia. */
export interface StoredVisionVector {
  readonly tenantId: string;
  readonly entityType: 'product' | 'supplier';
  readonly entityId: string;
  readonly label: string;
  readonly embedding: readonly number[];
  readonly model: string;
}

/**
 * Crea un almacen con estado PROPIO.
 *
 * Cada llamada devuelve un almacen aislado: dos tests no comparten filas, y el driver en
 * memoria guarda UNO solo para todo el proceso. Es el mismo reparto que `createSalesStores`.
 */
export function memoryVisionVectorStore(
  options: MemoryVisionVectorStoreOptions,
): VisionVectorStorePort {
  const rows = new Map<string, StoredVisionVector>();
  const keyOf = (tenantId: string, entityType: string, entityId: string) =>
    `${tenantId}\u0000${entityType}\u0000${entityId}`;

  return {
    upsert(actor: VisionActorContext, records: readonly VisionVectorRecord[]): Promise<void> {
      for (const record of records) {
        rows.set(keyOf(actor.tenantId, record.entityType, record.entityId), {
          tenantId: actor.tenantId,
          entityType: record.entityType,
          entityId: record.entityId,
          label: record.label,
          embedding: record.embedding,
          model: options.model,
        });
      }
      return Promise.resolve();
    },

    search(
      actor: VisionActorContext,
      input: {
        readonly entityType: 'product' | 'supplier';
        readonly embedding: readonly number[];
        readonly limit: number;
        readonly minScore?: number;
      },
    ): Promise<readonly VisionVectorMatch[]> {
      const minScore = input.minScore ?? 0;
      const scored: { readonly row: StoredVisionVector; readonly score: number }[] = [];

      for (const row of rows.values()) {
        // El mismo `and tenant_id = ... and entity_type = ... and model = ...` del SQL.
        if (row.tenantId !== actor.tenantId) continue;
        if (row.entityType !== input.entityType) continue;
        if (row.model !== options.model) continue;

        const score = cosine(input.embedding, row.embedding);
        if (score < minScore) continue;
        scored.push({ row, score });
      }

      scored.sort((a, b) => b.score - a.score);

      return Promise.resolve(
        scored.slice(0, input.limit).map(({ row, score }) => ({
          entityType: row.entityType,
          entityId: row.entityId,
          label: row.label,
          score,
        })),
      );
    },
  };
}

/**
 * Similitud coseno, la MISMA medida que `1 - (a <=> b)` de pgvector (`<=>` es la distancia
 * coseno, asi que el score de Postgres es el coseno en `[-1, 1]`).
 *
 * No se reescala a `[0, 1]`: hacerlo haria que el umbral `MIN_SCORE` del puente significase
 * una cosa sobre Postgres y otra en memoria, y la paridad de adaptadores —lo que justifica
 * que este archivo exista— se rompe en silencio.
 *
 * Un vector nulo no se parece a nada: devolver 0 y no `NaN` es lo que evita que un proveedor
 * que devuelve ceros —o un texto vacio embebido— envenene el orden.
 */
function cosine(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Caché de deduplicación de documentos en memoria para pruebas y desarrollo.
 * Aislado estrictamente por tenantId.
 */
export function memoryVisionDocumentCache(): VisionDocumentCachePort {
  const store = new Map<string, VisionDocumentCacheRecord>();
  const keyOf = (tenantId: string, documentHash: string) => `${tenantId}\u0000${documentHash}`;

  return {
    get(actor, documentHash) {
      return Promise.resolve(store.get(keyOf(actor.tenantId, documentHash)) ?? null);
    },
    set(actor, record) {
      store.set(keyOf(actor.tenantId, record.documentHash), record);
      return Promise.resolve();
    },
  };
}
