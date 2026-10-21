import { describe, expect, it } from 'vitest';
import type { Role } from '@corebiz/domain';
import type {
  VisionEmbeddingsPort,
  VisionVectorRecord,
  VisionVectorStorePort,
} from '@synapse-vision/core';
import type { TenantContext } from '../../ports/repositories';
import type { ReadModels } from '../../queries/read-models';
import { makeReindexVisionEmbeddings } from './reindex-vision-embeddings';

function ctxFor(role: Role): TenantContext {
  return {
    tenantId: 't1',
    tenantSlug: 'test',
    actor: { userId: 'u1', role },
    plan: 'free',
    settings: {},
    isDemo: false,
  } as unknown as TenantContext;
}

interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

interface QueryStub {
  readonly queries: ReadModels;
  readonly calls: { listProducts: number; listSuppliers: number };
}

function fakeQueries(
  productPages: readonly Page<{ id: string; name: string; sku: string }>[],
  supplierPages: readonly Page<{ id: string; name: string; code: string }>[] = [],
): QueryStub {
  const calls = { listProducts: 0, listSuppliers: 0 };
  let pi = 0;
  let si = 0;
  const products = {
    list: () => {
      calls.listProducts += 1;
      return Promise.resolve(productPages[pi++] ?? { items: [], nextCursor: null });
    },
  };
  const purchasing = {
    suppliers: () => {
      calls.listSuppliers += 1;
      return Promise.resolve(supplierPages[si++] ?? { items: [], nextCursor: null });
    },
  };
  return { queries: { products, purchasing } as unknown as ReadModels, calls };
}

function fakeEmbeddings() {
  const calls = { embed: 0 };
  const port = {
    embed: ({ texts }: { texts: readonly string[] }) => {
      calls.embed += 1;
      return Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]));
    },
  } as unknown as VisionEmbeddingsPort;
  return { port, calls };
}

function fakeStore() {
  const batches: (readonly VisionVectorRecord[])[] = [];
  const port = {
    upsert: (_actor: unknown, records: readonly VisionVectorRecord[]) => {
      batches.push(records);
      return Promise.resolve();
    },
  } as unknown as VisionVectorStorePort;
  return { port, batches };
}

describe('makeReindexVisionEmbeddings', () => {
  it('rejects an actor without ai:configure', async () => {
    const run = makeReindexVisionEmbeddings({
      ctx: ctxFor('viewer'),
      queries: fakeQueries([]).queries,
      embeddings: fakeEmbeddings().port,
      vectorStore: fakeStore().port,
    });

    expect(await run()).toEqual({ ok: false, error: { kind: 'Forbidden' } });
  });

  it('reports AiNotConfigured when the deployment has no RAG', async () => {
    const run = makeReindexVisionEmbeddings({
      ctx: ctxFor('owner'),
      queries: fakeQueries([]).queries,
    });

    expect(await run()).toEqual({ ok: false, error: { kind: 'AiNotConfigured' } });
  });

  it('paginates the catalog, embeds and stores every record', async () => {
    const queries = fakeQueries(
      [
        { items: [{ id: 'p1', name: 'Harina', sku: 'HRN-001' }], nextCursor: 'c1' },
        { items: [{ id: 'p2', name: 'Azucar', sku: 'AZC-002' }], nextCursor: null },
      ],
      [{ items: [{ id: 's1', name: 'Distribuidora', code: 'DIST' }], nextCursor: null }],
    );
    const embeddings = fakeEmbeddings();
    const store = fakeStore();
    const run = makeReindexVisionEmbeddings({
      ctx: ctxFor('owner'),
      queries: queries.queries,
      embeddings: embeddings.port,
      vectorStore: store.port,
    });

    expect(await run()).toEqual({ ok: true, value: { products: 2, suppliers: 1 } });

    // El catalogo se recorre pagina a pagina; el proveedor recibe un lote por origen.
    expect(queries.calls.listProducts).toBe(2);
    expect(embeddings.calls.embed).toBe(2);
    expect(store.batches).toHaveLength(2);

    const indexed = store.batches.flatMap((batch) =>
      batch.map((record) => `${record.entityType}:${record.entityId}`),
    );
    expect(indexed).toEqual(['product:p1', 'product:p2', 'supplier:s1']);
  });
});
